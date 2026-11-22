#!/usr/bin/env python3
"""Serveur de développement : ouvre l'interface dans Chrome (Web MIDI) sans l'app Mac.

Il sert le dossier web/ et les mêmes adresses /api/... que l'application.
Utile pour travailler sur l'interface avec les outils de développement de Chrome.

    make serve            (ou python3 tools/dev_server.py)

Options : --no-browser (ne pas ouvrir Chrome), --keep (ne pas s'arrêter seul).
Variables : SP_PORT (port, 8765 par défaut), SP_DATA_DIR, SP_IDLE (secondes).
"""
from __future__ import annotations

import json
import mimetypes
import os
import re
import subprocess
import sys
import threading
import time
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import config  # noqa: E402

WEB = config.ROOT / "web"
DATA = config.load().data_dir
HOST = "127.0.0.1"
PORT = int(os.environ.get("SP_PORT", "8765"))
IDLE_LIMIT = int(os.environ.get("SP_IDLE", "180"))  # arrêt sans fenêtre ouverte
SYNTHS = {"Prophet-6", "Trigon-6"}
MAX_BODY = 20 * 1024 * 1024

last_seen = time.time()


def synth_dir(name: str) -> Path:
    if name not in SYNTHS:
        raise ValueError(f"synthé inconnu : {name}")
    d = DATA / name
    d.mkdir(parents=True, exist_ok=True)
    return d


def write_atomic(path: Path, data: bytes) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(data)
    tmp.replace(path)


def clean_label(label: str) -> str:
    label = re.sub(r"[^\w ,.()+-]", "", label).strip()[:80]
    return label or "sauvegarde"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _send(self, code: int, body: bytes = b"", ctype: str = "application/json; charset=utf-8"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code: int = 200):
        self._send(code, json.dumps(obj, ensure_ascii=False).encode())

    def _body(self) -> bytes:
        n = int(self.headers.get("Content-Length", 0))
        if n > MAX_BODY:
            raise ValueError("contenu trop gros")
        return self.rfile.read(n)

    def do_GET(self):
        global last_seen
        last_seen = time.time()
        url = urlparse(self.path)
        if url.path == "/api/ping":
            return self._json({"ok": True})
        if url.path == "/api/info":
            return self._json({"vault": str(DATA), "exists": DATA.exists()})
        m = re.fullmatch(r"/api/db/([\w-]+)", url.path)
        if m:
            try:
                f = synth_dir(m[1]) / f"{m[1]}.json"
            except ValueError as e:
                return self._json({"error": str(e)}, 400)
            return self._json(json.loads(f.read_text("utf-8")) if f.exists() else {})
        # fichiers statiques de web/
        rel = unquote(url.path).lstrip("/") or "index.html"
        f = (WEB / rel).resolve()
        if WEB.resolve() not in f.parents or not f.is_file():
            return self._send(404, b"introuvable", "text/plain")
        ctype = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
        self._send(200, f.read_bytes(), f"{ctype}; charset=utf-8" if ctype.startswith("text") or ctype.endswith("javascript") else ctype)

    def do_POST(self):
        global last_seen
        last_seen = time.time()
        url = urlparse(self.path)
        m = re.fullmatch(r"/api/(db|backup|markdown|export)/([\w-]+)", url.path)
        if not m:
            return self._send(404, b"introuvable", "text/plain")
        kind, synth = m[1], m[2]
        try:
            d = synth_dir(synth)
            body = self._body()
        except ValueError as e:
            return self._json({"error": str(e)}, 400)

        if kind == "db":
            try:
                json.loads(body)
            except ValueError:
                return self._json({"error": "JSON invalide"}, 400)
            write_atomic(d / f"{synth}.json", body)
            return self._json({"ok": True})
        if kind == "markdown":
            write_atomic(d / f"{synth}.md", body)
            return self._json({"ok": True})

        # backup / export : fichier .syx daté dans Sauvegardes/
        label = clean_label(parse_qs(url.query).get("label", ["sauvegarde"])[0])
        out = d / "Sauvegardes"
        out.mkdir(exist_ok=True)
        name = f"{datetime.now():%Y-%m-%d %Hh%M} {label}.syx"
        write_atomic(out / name, body)
        return self._json({"ok": True, "file": f"{synth}/Sauvegardes/{name}", "name": name})


def open_chrome(url: str) -> None:
    # Safari ne gère pas le MIDI dans les pages web : il faut Chrome.
    try:
        subprocess.run(["open", "-na", "Google Chrome", "--args", f"--app={url}", "--window-size=1440,900"], check=True)
    except (OSError, subprocess.CalledProcessError):
        webbrowser.open(url)


def main() -> None:
    url = f"http://localhost:{PORT}/"
    DATA.mkdir(parents=True, exist_ok=True)
    try:
        server = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError:
        print("Le serveur tourne déjà : ouverture de Chrome.")
        open_chrome(url)
        return
    print(f"Interface : {url}")
    print(f"Données : {DATA}")
    if "--no-browser" not in sys.argv:
        open_chrome(url)

    def watchdog():
        while time.time() - last_seen < IDLE_LIMIT:
            time.sleep(5)
        print("Plus aucune fenêtre ouverte : arrêt.")
        server.shutdown()

    if "--keep" not in sys.argv:
        threading.Thread(target=watchdog, daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
