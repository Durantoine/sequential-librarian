// Presets Sequential : device Max for Live (effet MIDI), sans rien d'autre à lancer.
// Live ne laisse pas un device envoyer ET recevoir du SysEx sur la même piste :
// on se base donc sur les changements de programme (CC32 + Program Change) que le
// synthé envoie quand on change de preset, et sur la base de l'app (noms, protections).
// Entrée 0 : octets MIDI de [midiin], et commandes (init, tick, prev, next, synth 0|1).
// Sorties : 0 vers [midiout], 1 numéro, 2 nom, 3 infos, 4 statut.
inlets = 1;
outlets = 5;

var VAULT = "__VAULT__/";   // remplacé par build_device.py (config.json)
var SYNTHS = ["Trigon-6", "Prophet-6"];
var NAME_AT = { "Trigon-6": 116, "Prophet-6": 107 };
var INIT_NAME = "Basic Program";
var GREY = [0.49, 0.5, 0.54, 1], AMBER = [0.82, 0.6, 0.13, 1], RED = [0.97, 0.32, 0.29, 1];

var synth = SYNTHS[0];
var db = null, dbCount = 0;
var slot = null, chan = 0, bank = null, pendingBank = null;
var stat = 0, data = [], inSx = false, sx = [];
var seen = false, ticks = 0, shown = "", liveName = "";

/* ---------- Commandes du patch ---------- */
function init() { ticks = 0; loadDb(); show(); }
function anything() {
	var a = arrayfromargs(arguments);
	if (messagename === "synth") { synth = SYNTHS[a[0] ? 1 : 0]; slot = null; seen = false; liveName = ""; loadDb(); show(); }
}
function tick() { if (++ticks % 30 === 0) { loadDb(); show(); } }   // relit la base toutes les ~20 s
function prev() { step(-1); }
function next() { step(1); }

/* ---------- MIDI ---------- */
function msg_int(b) {
	outlet(0, b);   // tout passe tel quel vers la suite de la piste
	if (b === 0xF0) { inSx = true; sx = [b]; return; }
	if (inSx) {
		if (b >= 0xF8) return;
		sx.push(b);
		if (b === 0xF7) { inSx = false; onSysex(sx); }
		return;
	}
	if (b >= 0xF8) return;
	if (b >= 0x80) { stat = b; data = []; return; }
	if (!stat) return;
	data.push(b);
	var t = stat & 0xF0;
	if (t === 0xC0) { programChange(stat & 0x0F, b); data = []; }
	else if (t === 0xD0) data = [];
	else if (data.length === 2) {
		if (t === 0xB0 && data[0] === 32) pendingBank = data[1];
		data = [];
	}
}
function list() { var a = arrayfromargs(arguments); for (var i = 0; i < a.length; i++) msg_int(a[i]); }

function programChange(ch, p) {
	chan = ch;
	var b = pendingBank !== null ? pendingBank : (bank !== null ? bank : 0);
	bank = b; pendingBank = null;
	slot = b * 100 + p; seen = true; liveName = "";
	show();
}

// Bonus : si un dump de programme passe par la piste, on en lit le nom.
function onSysex(d) {
	if (d[1] !== 0x01 || (d[3] !== 0x02 && d[3] !== 0x03)) return;
	var name = extractName(unpack(d.slice(d[3] === 0x02 ? 6 : 4, d.length - 1)));
	if (name) { liveName = name; show(); }
}

function step(dir) {
	if (slot === null) { outlet(4, "set", "Change d'abord de preset sur le synthé"); return; }
	var n = Math.max(0, Math.min(999, slot + dir));
	var b = Math.floor(n / 100), p = n % 100;
	outlet(0, [0xB0 | chan, 32, b]);
	outlet(0, [0xC0 | chan, p]);
	slot = n; bank = b; liveName = "";
	show();
}

/* ---------- Base de l'app ---------- */
function loadDb() {
	db = null; dbCount = 0;
	try {
		var d = new Dict();
		d.import_json(VAULT + synth + "/" + synth + ".json");
		var o = JSON.parse(d.stringify());
		if (o && o.slots) { db = o.slots; for (var k in db) if (db[k].synthName) dbCount++; }
	} catch (e) { db = null; }
}
function key(n) { return ("00" + n).slice(-3); }
function slotInfo(n) { return db && n !== null && db[key(n)] ? db[key(n)] : null; }

/* ---------- Données SysEx ---------- */
function unpack(p) {
	var out = [];
	for (var i = 0; i < p.length; i += 8) {
		var msb = p[i];
		for (var j = 1; j < 8 && i + j < p.length; j++) out.push(p[i + j] | (((msb >> (j - 1)) & 1) << 7));
	}
	return out;
}
function readName(d, o) {
	var s = "";
	for (var i = o; i < o + 20; i++) { var c = d[i]; if (c === undefined || c < 32 || c > 126) return null; s += String.fromCharCode(c); }
	return s.replace(/\s+$/, "");
}
function extractName(d) {
	var at = NAME_AT[synth];
	if (at !== null) { var n = readName(d, at); if (n !== null) return n; }
	return "";
}

/* ---------- Affichage ---------- */
function show() {
	var num = slot !== null ? key(slot) : "–––";
	var s = slotInfo(slot);
	var name = "", info = [], color = GREY, status;
	if (slot === null) {
		info.push("Change de preset sur le synthé pour l'afficher");
	} else {
		name = liveName || (s && s.synthName) || "";
		if (name === INIT_NAME) name = "sans nom (Basic Program)";
		if (!name) name = "pas encore lu dans l'app";
		if (s && s.alert) { info.push("MODIFIÉ DEPUIS SA PROTECTION"); color = RED; }
		else if (s && s.protected) { info.push("PROTÉGÉ"); color = AMBER; }
		if (s && s.name) info.push("alias : " + s.name);
		if (s && s.type) info.push(s.type);
		if (slot >= 500) info.push("banque d'usine");
	}
	if (!db) status = "base " + synth + " introuvable : lis les banques dans l'app";
	else if (!seen) status = dbCount + " noms connus · en attente du synthé";
	else status = "canal " + (chan + 1);
	var txt = info.join("  ·  ");
	var sig = [num, name, txt, color.join(), status].join("|");
	if (sig === shown) return;
	shown = sig;
	outlet(1, "set", num);
	outlet(2, "set", name);
	outlet(3, "textcolor", color[0], color[1], color[2], color[3]);
	outlet(3, "set", txt || " ");
	outlet(4, "set", status);
}
