// Protection des presets, sauvegardes .syx et note Markdown.
"use strict";

/* ---------- Protection et sauvegardes ---------- */
async function toggleProtect(k) {
  const s = slot(k);
  if (s.protected) {
    const ok = await askConfirm({ title: `Retirer la protection de ${k} ?`, html: "Le gestionnaire ne te préviendra plus si ce preset est écrasé.", ok: "Retirer", });
    if (!ok) return;
    s.protected = false; delete s.protectedHash; delete s.protectedRaw; delete s.protectedAt; delete s.alert;
  } else {
    if (!raw.has(k)) {
      if (!conn) { toast("Connecte le synthé pour lire ce preset avant de le protéger"); return; }
      try { await readSlot(+k[0], +k.slice(1)); } catch { toast("Lecture impossible"); return; }
    }
    s.protected = true; s.protectedHash = s.hash; s.protectedRaw = b64(raw.get(k)); s.protectedAt = new Date().toISOString(); s.alert = false;
    toast(`${k} est protégé`);
  }
  cleanSlot(k); scheduleSave(); render();
}
async function acceptNewVersion(k) {
  const s = slot(k);
  if (!raw.has(k)) return;
  const ok = await askConfirm({ title: `Garder la nouvelle version de ${k} ?`, html: "La version actuelle du synthé devient la version protégée. Exporte d'abord l'ancienne si tu veux pouvoir la récupérer.", ok: "Garder la nouvelle" });
  if (!ok) return;
  s.protectedHash = s.hash; s.protectedRaw = b64(raw.get(k)); s.protectedAt = new Date().toISOString(); s.alert = false;
  scheduleSave(); render();
}
async function postSyx(kind, bytes, label) {
  if (conn?.mode === "demo") { toast(`Démo : le fichier « ${label} » aurait été enregistré`); return null; }
  const r = await fetch(`/api/${kind}/${synth}?label=${encodeURIComponent(label)}`, { method: "POST", body: bytes });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error);
  return j;
}
async function exportProtected(k) {
  const s = slot(k);
  try {
    const j = await postSyx("export", unb64(s.protectedRaw), `${synth} ${k} ${displayName(s)} (version protégée)`);
    if (j) { db.backups.push({ date: new Date().toISOString(), file: j.name, label: `${k} version protégée`, count: 1 }); scheduleSave(); toast(`Exporté dans ${j.file}`); }
  } catch { toast("Export impossible"); }
}
async function backup() {
  const keys = [...raw.keys()].sort();
  if (!keys.length) return;
  const banks = [...new Set(keys.map(k => k[0]))];
  const label = `${synth} ${keys.length} programmes (banque${banks.length > 1 ? "s" : ""} ${banks.join(",")})`;
  const total = keys.reduce((n, k) => n + raw.get(k).length, 0);
  const out = new Uint8Array(total);
  let o = 0; for (const k of keys) { out.set(raw.get(k), o); o += raw.get(k).length; }
  try {
    const j = await postSyx("backup", out, label);
    if (j) { db.backups.push({ date: new Date().toISOString(), file: j.name, label, count: keys.length }); scheduleSave(); render(); toast(`Sauvegardé dans ${j.file}`); }
  } catch { toast("Sauvegarde impossible"); }
}

/* ---------- Markdown pour Obsidian ---------- */
function buildMarkdown() {
  const esc = t => String(t || "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const rows = Object.entries(db.slots).sort(([a], [b]) => a.localeCompare(b));
  const prot = rows.filter(([, s]) => s.protected);
  const named = rows.filter(([, s]) => !s.protected && (s.name || s.notes || s.type));
  const state = s => s.alert ? "⚠️ modifié sur le synthé" : (s.lastRead && s.hash === s.protectedHash ? `✅ vérifié le ${fmtDate(s.lastRead)}` : "non vérifié");
  let md = `---\ntags: [music, presets, ${synth.toLowerCase()}]\n---\n\n# ${synth}\n\n`;
  md += `> [!info] Note générée automatiquement par le gestionnaire de presets (dernière mise à jour : ${fmtDate(new Date().toISOString())}).\n> Ne la modifie pas à la main : tes changements seraient écrasés. Fais-les dans le gestionnaire.\n\n`;
  md += `## 🔒 Presets protégés (${prot.length})\n\n`;
  md += prot.length ? "| Emplacement | Nom sur le synthé | Mon nom | Type | Notes | Protégé le | État |\n| :- | :- | :- | :- | :- | :- | :- |\n" +
    prot.map(([k, s]) => `| \`${k}\` | ${esc(s.synthName)} | ${esc(s.name)} | ${esc(s.type)} | ${esc(s.notes)} | ${s.protectedAt ? s.protectedAt.slice(0, 10) : ""} | ${state(s)} |`).join("\n") + "\n\n" : "_Aucun pour l'instant._\n\n";
  md += `## Autres presets annotés (${named.length})\n\n`;
  md += named.length ? "| Emplacement | Nom sur le synthé | Mon nom | Type | Notes |\n| :- | :- | :- | :- | :- |\n" +
    named.map(([k, s]) => `| \`${k}\` | ${esc(s.synthName)} | ${esc(s.name)} | ${esc(s.type)} | ${esc(s.notes)} |`).join("\n") + "\n\n" : "_Aucun pour l'instant._\n\n";
  const user = rows.filter(([k, s]) => isUser(+k[0]) && s.synthName);
  if (user.length) {
    md += `## Banques utilisateur, tels que lus sur le synthé (${user.length})\n\n> [!note]- Liste complète\n> | Emplacement | Nom |\n> | :- | :- |\n` +
      user.map(([k, s]) => `> | \`${k}\` | ${esc(s.name || s.synthName)}${s.protected ? " 🔒" : ""} |`).join("\n") + "\n\n";
  }
  md += `## Sauvegardes\n\n`;
  md += db.backups.length ? "| Date | Contenu | Fichier |\n| :- | :- | :- |\n" +
    db.backups.slice().reverse().map(b => `| ${fmtDate(b.date)} | ${esc(b.label)} | \`Sauvegardes/${esc(b.file)}\` |`).join("\n") + "\n" : "_Aucune pour l'instant._\n";
  return md;
}
