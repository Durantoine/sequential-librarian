// Petits éléments d'interface : toast, fenêtre de confirmation, barre de progression, utilitaires.
"use strict";

/* ---------- Petits éléments d'interface ---------- */
let toastTimer;
function toast(t) { const el = $("toast"); el.textContent = t; el.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 4200); }
function askConfirm({ title, html, ok = "Confirmer", onOpen }) {
  return new Promise(resolve => {
    $("mTitle").textContent = title; $("mBody").innerHTML = html; $("mOk").textContent = ok;
    const m = $("modal"); m.classList.add("show"); $("mOk").focus();
    if (onOpen) onOpen();
    const close = v => { m.classList.remove("show"); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = e => { if (e.key === "Escape") close(false); if (e.key === "Enter") close(true); };
    document.addEventListener("keydown", onKey);
    $("mOk").onclick = () => close(true); $("mCancel").onclick = () => close(false);
    m.onclick = e => { if (e.target === m) close(false); };
  });
}
function setBusyUi(on) {
  for (const id of ["btnReadBank", "btnReadAll"]) $(id).disabled = on || !conn;
  for (const id of ["btnConnect", "btnDemo"]) $(id).disabled = on;
  $("btnBackup").disabled = on || raw.size === 0;
  $("progress").classList.toggle("show", on);
  if (on) $("progress").querySelector(".bar > div").style.width = "0";
}
function setProgress(n, total, label) {
  $("progress").querySelector(".bar > div").style.width = (100 * n / total) + "%";
  setProgressText(`${label} · ${n}/${total}`);
}
function setProgressText(t) { $("progressText").textContent = t; }
function escapeHtml(t) { return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
const recent = iso => iso && Date.now() - new Date(iso).getTime() < 12 * 3600 * 1000;
const displayName = s => s?.name || s?.synthName || "";
const isEmpty = s => !s?.name && s?.synthName === INIT_NAME;
const matches = (s, q) => !!s && [s.name, s.synthName, s.notes, s.type].some(v => (v || "").toLowerCase().includes(q));
function factoryCopy(k, s) {
  const b = +k[0];
  if (!isUser(b) || !s?.hash) return false;
  return db.slots[`${b + 5}${k.slice(1)}`]?.hash === s.hash;
}
function select(k, byUser = false) { selected = k; bank = +k[0]; render(); if (byUser) playOnSynth(k); }
