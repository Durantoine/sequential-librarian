// Son en cours sur le synthé (edit buffer) : lecture régulière et emplacement correspondant.
"use strict";

/* ---------- Preset en cours sur le synthé ---------- */
// On lit le son chargé (edit buffer) régulièrement, puis on retrouve son emplacement.
const live = { slot: null, slotSource: null, name: "", hash: null, edited: false, ok: false, timer: null, bank: null, pendingBank: null, polling: false,
  chan: 0, data: null, msg: null, last: 0, holdUntil: 0,
  follow: loadPref("follow", "1") === "1", play: loadPref("play", "1") === "1" };
function startLive() {
  stopLive();
  Object.assign(live, { slot: null, slotSource: null, name: "", hash: null, edited: false, ok: false, data: null, msg: null });
  // Façade affichée : on relit le son plus souvent pour suivre les potards.
  live.timer = setInterval(() => { if (Date.now() - live.last >= (learning ? 150 : view === "panel" ? 500 : 1500)) pollEditBuffer(); }, 200);
  pollEditBuffer();
}
function stopLive() {
  clearInterval(live.timer); live.timer = null; live.ok = false;
  if (demoState.timer) { clearInterval(demoState.timer); demoState.timer = null; }
}
function guessSlot(h, name) {
  const ents = Object.entries(db.slots).filter(([, s]) => s.hash);
  let m = ents.filter(([, s]) => s.hash === h);
  if (!m.length && name && name !== INIT_NAME) m = ents.filter(([, s]) => s.synthName === name);
  if (!m.length) return null;
  if (live.slot && m.some(([k]) => k === live.slot)) return live.slot;
  m.sort(([a], [b]) => (isUser(+b[0]) - isUser(+a[0])) || a.localeCompare(b));
  return m[0][0];
}
async function pollEditBuffer() {
  if (!conn || busy || live.polling) return;
  if (document.hidden && Date.now() - live.last < 5000) return;   // fenêtre cachée : on relit moins souvent
  live.polling = true; live.last = Date.now();
  try {
    const msg = await requestEditBuffer(1500);
    const data = unpack(msg.subarray(4, msg.length - 1));
    const h = await hashOf(data), name = extractName(data);
    const prevSlot = live.slot, changed = h !== live.hash || !live.ok;
    live.hash = h; live.name = name; live.ok = true; live.msg = msg;
    if (Date.now() > live.holdUntil) { live.data = data; if (view === "panel" && changed) updatePanel(); }
    if (learning) learnTick(data);
    const known = live.slot && db.slots[live.slot];
    if (!live.slot || live.slotSource !== "pc" || (known?.synthName && known.synthName !== name)) {
      const g = guessSlot(h, name);
      live.slot = g; live.slotSource = g ? "guess" : null;
    }
    const s = live.slot && db.slots[live.slot];
    live.edited = !!(s?.hash && s.hash !== h);
    if (changed || prevSlot !== live.slot) {
      renderLive();
      const typing = document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.id !== "search";
      if (live.follow && live.slot && live.slot !== selected && prevSlot !== live.slot && !typing) select(live.slot);
      else markPlaying();
    }
  } catch { if (live.ok) { live.ok = false; renderLive(); if (view === "panel") renderPanel(); } }
  live.polling = false;
}
function markPlaying() {
  $("grid").querySelectorAll(".cell").forEach(c => {
    const on = !!conn && live.ok && c.dataset.k === live.slot;
    c.classList.toggle("playing", on);
    const eq = c.querySelector(".eq");
    if (on && !eq) c.insertAdjacentHTML("beforeend", `<span class="eq"><i></i><i></i><i></i></span>`);
    if (!on && eq) eq.remove();
  });
}
function renderLive() {
  const el = $("now");
  el.classList.toggle("show", !!conn);
  if (!conn) return;
  const has = live.ok;
  const empty = live.name === INIT_NAME;
  el.innerHTML = `
    <div class="now-disp" id="nowDisp" title="${live.slot ? "Afficher ce preset" : ""}">
      <div class="lbl"><span class="eq ${has ? "" : "off"}"><i></i><i></i><i></i></span>Sur le synthé</div>
      <div class="n">${has ? (live.slot || "···") : "–––"}</div>
      <div class="t ${empty ? "empty" : ""}">${has ? escapeHtml(empty ? "Basic Program · sans nom" : live.name || "sans nom") : "en attente…"}</div>
      ${has && live.edited ? `<span class="pill">modifié</span>` : ""}
      ${has && !live.slot ? `<span class="pill" title="Lis les banques pour retrouver l'emplacement">emplacement ?</span>` : ""}
    </div>
    <button class="btn sm follow ${live.follow ? "on" : ""}" id="btnFollow" title="Sélectionner automatiquement le preset joué">Suivre</button>
    <button class="btn sm follow ${live.play ? "on" : ""}" id="btnPlay" title="Cliquer sur un preset le charge aussi sur le synthé">Jouer</button>
    <button class="btn sm" id="btnSave" ${has && conn.mode === "midi" && !busy ? "" : "disabled"} title="Enregistrer le son en cours, avec tes réglages, dans un emplacement">${icon("save")}Sauver</button>`;
  $("nowDisp").onclick = () => live.slot && select(live.slot);
  $("btnPlay").onclick = () => { live.play = !live.play; savePref("play", live.play ? "1" : "0"); renderLive(); };
  $("btnSave").onclick = saveCurrent;
  $("btnFollow").onclick = () => { live.follow = !live.follow; savePref("follow", live.follow ? "1" : "0"); if (live.follow && live.slot) select(live.slot); else renderLive(); };
}
