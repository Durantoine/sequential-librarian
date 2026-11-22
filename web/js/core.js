// Constantes, état global et préférences.
"use strict";

// Format SysEx : manuels Prophet-6 (p. 74-77) et Trigon-6 (p. 76-79).
// L'identifiant réel de l'appareil est demandé au synthé (Device Inquiry).
const SYNTHS = {
  "Trigon-6":  { match: /trigon/i,           expectId: 0x39 },
  "Prophet-6": { match: /prophet\s*-?\s*6/i, expectId: 0x2D },
};
// Nom du programme : 20 caractères ASCII dans les données décompressées.
// Trigon-6 : position 116 (vérifiée sur la machine). Prophet-6 : recherche automatique, renommage désactivé.
const NAME_AT = { "Trigon-6": 116, "Prophet-6": null };
const INIT_NAME = "Basic Program";
const TYPES = ["pad", "lead", "basse", "keys", "brass", "cordes", "pluck", "arp", "fx", "percu", "autre"];
const $ = id => document.getElementById(id);
const pad2 = n => String(n).padStart(2, "0");
const keyOf = (b, p) => `${b}${pad2(p)}`;
const isUser = b => b < 5;
const fmtDate = iso => iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "jamais";
const icon = (id, cls = "i") => `<svg class="${cls}"><use href="#i-${id}"/></svg>`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let synth = loadPref("synth", "Trigon-6");
let bank = 0, selected = "000";
let db = null;                 // base du synthé courant (fichier JSON du vault)
let raw = new Map();           // messages SysEx lus pendant cette session (clé -> Uint8Array)
let midi = null, conn = null;  // conn = { mode: "midi" | "demo", input, output, id }
let busy = false, cancelRequested = false;
let view = loadPref("view", "grid");   // "grid" ou "panel"

const waiters = [];

function loadPref(k, d) { try { return localStorage.getItem("sp." + k) || d; } catch { return d; } }
function savePref(k, v) { try { localStorage.setItem("sp." + k, v); } catch {} }
