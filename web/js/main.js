// Branchement des événements et démarrage.
"use strict";

/* ---------- Événements ---------- */
$("btnConnect").onclick = openConnBox;
$("btnInquiry").onclick = verifyConnection;
$("btnDemo").onclick = startDemo;
$("btnReadBank").onclick = () => readRange(rangeBanks(bank, bank), `Banque ${bank}`);
$("btnReadAll").onclick = () => readRange(rangeBanks(0, 9), "Banques 0 à 9");
$("btnCancel").onclick = () => { cancelRequested = true; };
$("btnBackup").onclick = backup;
$("search").oninput = render;
document.addEventListener("keydown", e => {
  if ($("modal").classList.contains("show") || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  const n = +selected.slice(1), moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 10, ArrowUp: -10 };
  if (view === "panel") return;
  if (moves[e.key] !== undefined) { e.preventDefault(); select(keyOf(bank, Math.min(99, Math.max(0, n + moves[e.key]))), true); }
  if (/^[0-9]$/.test(e.key)) { bank = +e.key; selected = keyOf(bank, n); render(); }
  if (e.key === "/") { e.preventDefault(); $("search").focus(); }
});
$("demoOverwrite").onclick = () => {
  const prot = Object.entries(db.slots).filter(([, s]) => s.protected).map(([k]) => k);
  if (!prot.length) { toast("Protège d'abord un preset (par exemple 012), puis réessaie"); return; }
  const k = prot[0];
  demoState.overrides.set(k, 99999);
  toast(`${k} a été « écrasé » sur le synthé simulé. Relis la banque ${k[0]} pour voir l'alerte.`);
};
window.addEventListener("resize", () => { if (view === "panel") fitPanel(); });
window.addEventListener("beforeunload", () => { if (saveTimer) saveNow(); });

document.body.classList.toggle("wide", loadPref("wide", "") === "1");
document.body.classList.toggle("v-panel", view === "panel" && !!LAYOUTS[synth]);
if (!LAYOUTS[synth]) view = "grid";
// Signal de vie pour le serveur de développement (il s'arrête seul sans fenêtre ouverte).
setInterval(() => fetch("/api/ping").catch(() => {}), 20000);
initReorder();
loadDb().then(() => { render(); autoConnect(); });
