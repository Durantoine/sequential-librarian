// Base du synthé (fichier JSON du dossier de données) : chargement et enregistrement.
"use strict";

/* ---------- Données ---------- */
function emptyDb() { return { version: 1, synth, device: null, slots: {}, backups: [] }; }
async function loadDb() {
  raw = new Map();
  if (conn?.mode === "demo") { db = demoDb(); return; }
  try {
    const r = await fetch(`/api/db/${synth}`);
    const j = await r.json();
    db = j && j.slots ? j : emptyDb();
    db.backups ||= [];
    if (db.panelCheck?.nameAt !== undefined) NAME_AT[synth] = db.panelCheck.nameAt;   // nom confirmé par la vérification
  } catch { db = emptyDb(); toast("Dossier de données inaccessible : vérifie dataDir dans config.json"); }
}
function slot(k) { return db.slots[k] || (db.slots[k] = {}); }
function cleanSlot(k) {
  const s = db.slots[k]; if (!s) return;
  if (!s.name && !s.notes && !s.type && !s.protected && !s.hash) delete db.slots[k];
}
let saveTimer = null;
function scheduleSave() {
  if (conn?.mode === "demo") return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}
async function saveNow() {
  saveTimer = null;
  db.updated = new Date().toISOString();
  try {
    await fetch(`/api/db/${synth}`, { method: "POST", body: JSON.stringify(db, null, 1) });
    await fetch(`/api/markdown/${synth}`, { method: "POST", body: buildMarkdown() });
  } catch { toast("Impossible d'enregistrer dans le dossier de données"); }
}
