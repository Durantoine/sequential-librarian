// Sequential Librarian : application Mac.
// Affiche l'interface (web/) dans une fenêtre native et lui fournit :
//  - le MIDI (CoreMIDI), sous la même forme que le Web MIDI des navigateurs ;
//  - l'accès aux fichiers du dossier de données (mêmes adresses /api/... que tools/dev_server.py).
// Aucun navigateur ni serveur n'est nécessaire.
//
// Mode test : PresetsSequential --test script.js resultat.txt
//   exécute script.js dans la page une fois chargée, écrit sa valeur de retour
//   dans resultat.txt (et une capture dans resultat.txt.png), puis quitte.
import Cocoa
import CoreMIDI
import WebKit

// Dossier du projet : inscrit dans Info.plist à la construction (scripts/build_app.py).
// L'interface y est relue à chaque ouverture ; à défaut, la copie embarquée dans l'application.
let PROJECT: URL? = (Bundle.main.object(forInfoDictionaryKey: "SLProjectDir") as? String).map { URL(fileURLWithPath: $0) }
let WEB_DIRS: [URL] = [PROJECT?.appendingPathComponent("web"), Bundle.main.resourceURL?.appendingPathComponent("web")].compactMap { $0 }

/// Dossier des données : variable SP_DATA_DIR, sinon clé dataDir de config.json, sinon ~/Documents/Sequential Librarian.
let VAULT: URL = {
    let expand = { (p: String) in URL(fileURLWithPath: (p as NSString).expandingTildeInPath) }
    if let v = ProcessInfo.processInfo.environment["SP_DATA_DIR"] { return expand(v) }
    if let root = PROJECT, let d = try? Data(contentsOf: root.appendingPathComponent("config.json")),
       let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let v = o["dataDir"] as? String {
        return expand(v)
    }
    return expand("~/Documents/Sequential Librarian")
}()
let SYNTHS: Set<String> = ["Prophet-6", "Trigon-6"]

// MARK: - Pont JavaScript (injecté avant la page)

let BRIDGE_JS = #"""
(() => {
  const post = (h, m) => window.webkit.messageHandlers[h].postMessage(m);
  const inputs = new Map(), outputs = new Map();
  let access = null;
  function makeInput(p) {
    let handler = null;
    return {
      id: p.id, name: p.name, manufacturer: "", type: "input", state: "connected", connection: "open",
      get onmidimessage() { return handler; },
      set onmidimessage(f) { handler = f; post("midi", { op: "listen", id: this.id, on: !!f }); },
    };
  }
  function makeOutput(p) {
    return {
      id: p.id, name: p.name, manufacturer: "", type: "output", state: "connected", connection: "open",
      send(data) { post("midi", { op: "send", id: this.id, data: Array.from(data) }); },
    };
  }
  function sync(list) {
    let changed = false;
    for (const [map, arr, make] of [[inputs, list.inputs, makeInput], [outputs, list.outputs, makeOutput]]) {
      const ids = new Set(arr.map(p => p.id));
      for (const [id, port] of map) if (!ids.has(id)) { port.state = "disconnected"; map.delete(id); changed = true; }
      for (const p of arr) if (!map.has(p.id)) { map.set(p.id, make(p)); changed = true; }
    }
    return changed;
  }
  window.__spPorts = list => { if (sync(list) && access && access.onstatechange) access.onstatechange({}); };
  window.__spMidiIn = (id, bytes) => { const p = inputs.get(id); if (p && p.onmidimessage) p.onmidimessage({ data: Uint8Array.from(bytes), timeStamp: performance.now() }); };
  navigator.requestMIDIAccess = async () => {
    if (!access) {
      sync(await post("midi", { op: "ports" }));
      access = { inputs, outputs, sysexEnabled: true, onstatechange: null };
    }
    return access;
  };
  // Les adresses /api/... sont traitées par l'application (fichiers du vault).
  const nativeFetch = window.fetch.bind(window);
  const toB64 = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  window.fetch = async (url, opt = {}) => {
    const u = new URL(url, location.href);
    if (!u.pathname.startsWith("/api/")) return nativeFetch(url, opt);
    const b = opt.body;
    const msg = { method: (opt.method || "GET").toUpperCase(), path: u.pathname, query: u.search.slice(1) };
    if (typeof b === "string") msg.text = b;
    else if (b instanceof Uint8Array) msg.b64 = toB64(b);
    else if (b instanceof ArrayBuffer) msg.b64 = toB64(new Uint8Array(b));
    const r = await post("api", msg);
    return new Response(r.body, { status: r.status, headers: { "Content-Type": "application/json; charset=utf-8" } });
  };
  window.__spNative = true;
})();
"""#

// MARK: - MIDI

final class Midi {
    var client = MIDIClientRef()
    var inPort = MIDIPortRef()
    var outPort = MIDIPortRef()
    var listening = Set<Int32>()
    var parsers = [Int32: Parser]()
    let lock = NSLock()
    var onMessage: ((Int32, [UInt8]) -> Void)?
    var onChange: (() -> Void)?

    /// Reconstitue des messages MIDI complets (SysEx compris) à partir des paquets reçus.
    final class Parser {
        var sysex: [UInt8]? = nil
        var status: UInt8 = 0
        var data: [UInt8] = []
        func feed(_ bytes: UnsafeBufferPointer<UInt8>, _ emit: ([UInt8]) -> Void) {
            for b in bytes {
                if b >= 0xF8 { continue }                        // horloge, active sensing… ignorés
                if b == 0xF0 { sysex = [b]; continue }
                if sysex != nil {
                    if b == 0xF7 { sysex!.append(b); emit(sysex!); sysex = nil; continue }
                    if b & 0x80 != 0 { sysex = nil } else { sysex!.append(b); continue }
                }
                if b & 0x80 != 0 { status = b; data = []; if b >= 0xF4 { emit([b]); status = 0 }; continue }
                guard status != 0 else { continue }
                data.append(b)
                let hi = status & 0xF0
                let need: Int = (hi == 0xC0 || hi == 0xD0 || status == 0xF1 || status == 0xF3) ? 1 : (status == 0xF2 || hi < 0xF0) ? 2 : 0
                if data.count == need { emit([status] + data); data = []; if status >= 0xF0 { status = 0 } }
            }
        }
    }

    init() {
        MIDIClientCreateWithBlock("Sequential Librarian" as CFString, &client) { [weak self] n in
            if n.pointee.messageID == .msgSetupChanged { DispatchQueue.main.async { self?.reconnect(); self?.onChange?() } }
        }
        MIDIInputPortCreateWithBlock(client, "entrée" as CFString, &inPort) { [weak self] list, src in
            guard let self = self, let src = src else { return }
            let uid = Int32(truncatingIfNeeded: Int(bitPattern: src))
            var msgs: [[UInt8]] = []
            self.lock.lock(); defer { self.lock.unlock() }
            let parser = self.parsers[uid] ?? { let p = Parser(); self.parsers[uid] = p; return p }()
            for packet in list.unsafeSequence() {
                let len = Int(packet.pointee.length)
                // Les données d'un paquet peuvent dépasser la taille déclarée du tuple : on lit depuis l'adresse du paquet.
                let base = UnsafeRawPointer(packet).advanced(by: MemoryLayout<MIDIPacket>.offset(of: \MIDIPacket.data)!)
                parser.feed(UnsafeBufferPointer(start: base.assumingMemoryBound(to: UInt8.self), count: len)) { msgs.append($0) }
            }
            if !msgs.isEmpty { DispatchQueue.main.async { for m in msgs { self.onMessage?(uid, m) } } }
        }
        MIDIOutputPortCreate(client, "sortie" as CFString, &outPort)
    }

    func uid(_ obj: MIDIObjectRef) -> Int32 { var v: Int32 = 0; MIDIObjectGetIntegerProperty(obj, kMIDIPropertyUniqueID, &v); return v }
    func name(_ obj: MIDIObjectRef) -> String {
        var s: Unmanaged<CFString>?
        if MIDIObjectGetStringProperty(obj, kMIDIPropertyDisplayName, &s) == noErr, let v = s?.takeRetainedValue() { return v as String }
        if MIDIObjectGetStringProperty(obj, kMIDIPropertyName, &s) == noErr, let v = s?.takeRetainedValue() { return v as String }
        return "?"
    }
    var sources: [MIDIEndpointRef] { (0..<MIDIGetNumberOfSources()).map { MIDIGetSource($0) } }
    var destinations: [MIDIEndpointRef] { (0..<MIDIGetNumberOfDestinations()).map { MIDIGetDestination($0) } }

    func ports() -> [String: Any] {
        ["inputs": sources.map { ["id": String(uid($0)), "name": name($0)] },
         "outputs": destinations.map { ["id": String(uid($0)), "name": name($0)] }]
    }
    func listen(_ id: Int32, _ on: Bool) {
        if on { listening.insert(id) } else { listening.remove(id) }
        reconnect()
    }
    var connected = Set<Int32>()
    func reconnect() {
        for src in sources {
            let id = uid(src)
            let want = listening.contains(id)
            if want && !connected.contains(id) {
                MIDIPortConnectSource(inPort, src, UnsafeMutableRawPointer(bitPattern: Int(id)))
                connected.insert(id)
            } else if !want && connected.contains(id) {
                MIDIPortDisconnectSource(inPort, src); connected.remove(id)
                lock.lock(); parsers[id] = nil; lock.unlock()
            }
        }
        let present = Set(sources.map(uid))
        connected.formIntersection(present)
    }
    func send(_ id: Int32, _ bytes: [UInt8]) {
        guard let dst = destinations.first(where: { uid($0) == id }), !bytes.isEmpty else { return }
        let size = bytes.count + 1024
        let buf = UnsafeMutableRawPointer.allocate(byteCount: size, alignment: 8)
        defer { buf.deallocate() }
        let list = buf.assumingMemoryBound(to: MIDIPacketList.self)
        var pkt = MIDIPacketListInit(list)
        bytes.withUnsafeBufferPointer { pkt = MIDIPacketListAdd(list, size, pkt, 0, bytes.count, $0.baseAddress!) }
        MIDISend(outPort, dst, list)
    }
}

// MARK: - Fichiers (équivalent de server.py)

enum Api {
    static func json(_ o: Any, _ status: Int = 200) -> [String: Any] {
        let d = (try? JSONSerialization.data(withJSONObject: o)) ?? Data("{}".utf8)
        return ["status": status, "body": String(data: d, encoding: .utf8) ?? "{}"]
    }
    static func dir(_ synth: String) throws -> URL {
        guard SYNTHS.contains(synth) else { throw NSError(domain: "sp", code: 1) }
        let d = VAULT.appendingPathComponent(synth)
        try FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }
    static func write(_ data: Data, _ url: URL) throws {
        let tmp = url.appendingPathExtension("tmp")
        try data.write(to: tmp)
        _ = try FileManager.default.replaceItemAt(url, withItemAt: tmp)
    }
    static func handle(_ m: [String: Any]) -> [String: Any] {
        let method = m["method"] as? String ?? "GET", path = m["path"] as? String ?? ""
        let parts = path.split(separator: "/").map(String.init)   // ["api", kind, synth]
        guard parts.count >= 2, parts[0] == "api" else { return json(["error": "introuvable"], 404) }
        let kind = parts[1], synth = parts.count > 2 ? parts[2].removingPercentEncoding ?? parts[2] : ""
        do {
            if method == "GET" {
                if kind == "ping" { return json(["ok": true]) }
                if kind == "info" { return json(["vault": VAULT.path, "exists": FileManager.default.fileExists(atPath: VAULT.path)]) }
                if kind == "db" {
                    let f = try dir(synth).appendingPathComponent("\(synth).json")
                    guard let d = try? Data(contentsOf: f), let s = String(data: d, encoding: .utf8) else { return ["status": 200, "body": "{}"] }
                    return ["status": 200, "body": s]
                }
                return json(["error": "introuvable"], 404)
            }
            let body: Data = (m["text"] as? String).map { Data($0.utf8) } ?? (m["b64"] as? String).flatMap { Data(base64Encoded: $0) } ?? Data()
            let d = try dir(synth)
            switch kind {
            case "db":
                _ = try JSONSerialization.jsonObject(with: body)   // refuse un JSON invalide
                try write(body, d.appendingPathComponent("\(synth).json"))
                return json(["ok": true])
            case "markdown":
                try write(body, d.appendingPathComponent("\(synth).md"))
                return json(["ok": true])
            case "backup", "export":
                let q = URLComponents(string: "?" + (m["query"] as? String ?? ""))?.queryItems ?? []
                var label = q.first(where: { $0.name == "label" })?.value ?? "sauvegarde"
                label = String(label.unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) || " ,.()+-_".unicodeScalars.contains($0) })
                    .trimmingCharacters(in: .whitespaces)
                if label.isEmpty { label = "sauvegarde" }
                label = String(label.prefix(80))
                let out = d.appendingPathComponent("Sauvegardes")
                try FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
                let fmt = DateFormatter(); fmt.dateFormat = "yyyy-MM-dd HH'h'mm"
                let name = "\(fmt.string(from: Date())) \(label).syx"
                try write(body, out.appendingPathComponent(name))
                return json(["ok": true, "file": "\(synth)/Sauvegardes/\(name)", "name": name])
            default:
                return json(["error": "introuvable"], 404)
            }
        } catch {
            return json(["error": "\(error.localizedDescription)"], 400)
        }
    }
}

// MARK: - Pages (dossier web/ servi sous sp://app/)

final class Pages: NSObject, WKURLSchemeHandler {
    static let types = ["html": "text/html", "css": "text/css", "js": "text/javascript", "png": "image/png", "svg": "image/svg+xml", "json": "application/json"]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        var rel = url.path.hasPrefix("/") ? String(url.path.dropFirst()) : url.path
        if rel.isEmpty { rel = "index.html" }
        // Seuls les fichiers à l'intérieur de web/ sont servis.
        let file = WEB_DIRS.lazy.map { $0.appendingPathComponent(rel).standardizedFileURL }
            .first { f in WEB_DIRS.contains { f.path.hasPrefix($0.standardizedFileURL.path + "/") } && FileManager.default.fileExists(atPath: f.path) }
        guard let f = file, let data = try? Data(contentsOf: f) else {
            task.didFailWithError(NSError(domain: "SequentialLibrarian", code: 404)); return
        }
        let type = Pages.types[f.pathExtension.lowercased()] ?? "application/octet-stream"
        task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                                        headerFields: ["Content-Type": "\(type); charset=utf-8", "Cache-Control": "no-store"])!)
        task.didReceive(data)
        task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

// MARK: - Application

final class App: NSObject, NSApplicationDelegate, WKScriptMessageHandlerWithReply, WKNavigationDelegate, NSWindowDelegate {
    var window: NSWindow!
    var web: WKWebView!
    let midi = Midi()
    let pages = Pages()
    var testScript: String? = nil
    var testOut: String? = nil

    func applicationDidFinishLaunching(_ n: Notification) {
        let args = CommandLine.arguments
        if let i = args.firstIndex(of: "--test"), i + 2 < args.count { testScript = args[i + 1]; testOut = args[i + 2] }

        let cfg = WKWebViewConfiguration()
        cfg.setURLSchemeHandler(pages, forURLScheme: "sp")
        cfg.userContentController.addUserScript(WKUserScript(source: BRIDGE_JS, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        cfg.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "midi")
        cfg.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "api")
        web = WKWebView(frame: .zero, configuration: cfg)
        web.navigationDelegate = self
        web.setValue(false, forKey: "drawsBackground")
        if #available(macOS 13.3, *) { web.isInspectable = true }

        let frame = NSRect(x: 0, y: 0, width: 1440, height: 900)
        window = NSWindow(contentRect: frame, styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Sequential Librarian"
        window.appearance = NSAppearance(named: .darkAqua)
        window.titlebarAppearsTransparent = true
        window.backgroundColor = NSColor(red: 0x11 / 255.0, green: 0x12 / 255.0, blue: 0x14 / 255.0, alpha: 1)
        window.minSize = NSSize(width: 900, height: 600)
        window.contentView = web
        window.delegate = self
        window.setFrameAutosaveName("Sequential LibrarianMain")
        if !window.setFrameUsingName("Sequential LibrarianMain") { window.center() }
        window.makeKeyAndOrderFront(nil)

        midi.onMessage = { [weak self] id, bytes in
            self?.web.evaluateJavaScript("__spMidiIn(\"\(id)\",[\(bytes.map(String.init).joined(separator: ","))])")
        }
        midi.onChange = { [weak self] in self?.pushPorts() }

        buildMenu()
        web.load(URLRequest(url: URL(string: "sp://app/index.html")!))
        NSApp.activate(ignoringOtherApps: true)
    }

    func pushPorts() {
        guard let d = try? JSONSerialization.data(withJSONObject: midi.ports()), let s = String(data: d, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.__spPorts && __spPorts(\(s))")
    }

    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard let m = message.body as? [String: Any] else { return replyHandler(nil, "message invalide") }
        if message.name == "api" { return replyHandler(Api.handle(m), nil) }
        switch m["op"] as? String {
        case "ports": replyHandler(midi.ports(), nil)
        case "listen":
            if let id = Int32(m["id"] as? String ?? "") { midi.listen(id, m["on"] as? Bool ?? false) }
            replyHandler(true, nil)
        case "send":
            if let id = Int32(m["id"] as? String ?? ""), let data = m["data"] as? [NSNumber] { midi.send(id, data.map { $0.uint8Value }) }
            replyHandler(true, nil)
        default: replyHandler(nil, "inconnu")
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let script = testScript, let out = testOut, let code = try? String(contentsOfFile: script, encoding: .utf8) else { return }
        // Mode test : exécute un script dans la page, écrit son résultat, puis quitte.
        web.callAsyncJavaScript(code, arguments: [:], in: nil, in: .page) { result in
            var text: String
            switch result {
            case .success(let v): text = (v as? String) ?? String(describing: v)
            case .failure(let e): text = "ERREUR " + String(describing: e)
            }
            try? text.write(toFile: out, atomically: true, encoding: .utf8)
            let cfg = WKSnapshotConfiguration()
            self.web.takeSnapshot(with: cfg) { img, _ in
                if let img = img, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) {
                    try? png.write(to: URL(fileURLWithPath: out + ".png"))
                }
                NSApp.terminate(nil)
            }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ s: NSApplication) -> Bool { true }

    @objc func reload() { web.reload() }

    func buildMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem(); main.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "À propos de Sequential Librarian", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Masquer Sequential Librarian", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "Quitter Sequential Librarian", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu

        let editItem = NSMenuItem(); main.addItem(editItem)
        let edit = NSMenu(title: "Édition")
        edit.addItem(withTitle: "Annuler", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "Rétablir", action: Selector(("redo:")), keyEquivalent: "Z")
        edit.addItem(.separator())
        edit.addItem(withTitle: "Couper", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copier", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Coller", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Tout sélectionner", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit

        let viewItem = NSMenuItem(); main.addItem(viewItem)
        let view = NSMenu(title: "Présentation")
        view.addItem(withTitle: "Recharger", action: #selector(reload), keyEquivalent: "r").target = self
        view.addItem(withTitle: "Plein écran", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f").keyEquivalentModifierMask = [.command, .control]
        viewItem.submenu = view

        let winItem = NSMenuItem(); main.addItem(winItem)
        let win = NSMenu(title: "Fenêtre")
        win.addItem(withTitle: "Réduire", action: #selector(NSWindow.miniaturize(_:)), keyEquivalent: "m")
        win.addItem(withTitle: "Fermer", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        winItem.submenu = win
        NSApp.mainMenu = main
        NSApp.windowsMenu = win
    }
}

let app = NSApplication.shared
let delegate = App()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
