// Façade du Trigon-6 : potards synchronisés avec le son en cours.
"use strict";

/* ---------- Façade ---------- */
// Réglages du Trigon-6 dont la place dans les données a été vérifiée sur la machine :
// chaque CC envoyé modifie exactement l'octet indiqué du son en cours.
// k : potard (max = valeur maxi, enum = la valeur CC est la valeur elle-même), s : interrupteur, o : sélecteur, r : affichage seul.
const PANELS = {
  "Trigon-6": [
    { t: "Mixeur", c: [
      { k: "Osc 1", off: 17, max: 127, cc: 69 },
      { k: "Osc 2", off: 18, max: 127, cc: 77 },
    ] },
    { t: "Filtre", c: [
      { k: "Cutoff", off: 29, max: 164, cc: 102, big: 1 },
      { k: "Résonance", off: 30, max: 255, cc: 103, big: 1 },
      { k: "Env. amt", off: 36, max: 254, cc: 47, bi: 1 },
      { k: "Passe-haut", off: 28, max: 254, cc: 106 },
      { o: "Clavier", off: 31, cc: 104, opts: ["Off", "½", "Full"] },
      { s: "Vélocité", off: 32, cc: 105 },
    ] },
    { t: "Enveloppe filtre", c: [
      { k: "Attack", off: 40, max: 127, cc: 50 }, { k: "Decay", off: 42, max: 127, cc: 51 },
      { k: "Sustain", off: 44, max: 127, cc: 52 }, { k: "Release", off: 46, max: 127, cc: 53 },
    ] },
    { t: "Enveloppe ampli", c: [
      { k: "Attack", off: 41, max: 127, cc: 43 }, { k: "Decay", off: 43, max: 127, cc: 44 },
      { k: "Sustain", off: 45, max: 127, cc: 45 }, { k: "Release", off: 47, max: 127, cc: 46 },
      { s: "Vélocité", off: 48, cc: 41 },
    ] },
    { t: "Glide", c: [ { k: "Rate", off: 23, max: 127, cc: 5 }, { s: "On", off: 25, cc: 65 } ] },
    { t: "Distorsion", c: [ { k: "Amount", off: 63, max: 127, cc: 9 } ] },
    { t: "Arpégiateur", c: [
      { s: "On", off: 102, cc: 58 },
      { o: "Mode", off: 100, cc: 59, opts: ["1", "2", "3", "4", "5"] },
      { o: "Octaves", off: 101, cc: 60, opts: ["1", "2", "3"] },
      { k: "Division", off: 103, max: 9, cc: 62, enum: 1 },
      { r: "BPM", off: 98 },
    ] },
  ],
};
const ctrls = () => (PANELS[synth] || []).flatMap(sec => sec.c);
function setView(v) {
  if (v === "panel" && !PANELS[synth]) v = "grid";
  view = v; savePref("view", v);
  document.body.classList.toggle("v-panel", v === "panel");
  render();
  if (v === "panel") pollEditBuffer();
}
const A0 = -135, A1 = 135;
function arc(a, b, r = 19) {
  const pt = a => { const t = (a - 90) * Math.PI / 180; return [25 + r * Math.cos(t), 25 + r * Math.sin(t)]; };
  const [x0, y0] = pt(a), [x1, y1] = pt(b);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
function knobSvg(c, v) {
  const f = Math.max(0, Math.min(1, v / c.max)), a = A0 + f * (A1 - A0);
  const from = c.bi ? 0 : A0;
  const t = (a - 90) * Math.PI / 180;
  return `<svg viewBox="0 0 50 50"><path class="trk" d="${arc(A0, A1)}" fill="none" stroke-width="3.2" stroke-linecap="round"/>` +
    (Math.abs(a - from) > .5 ? `<path class="val" d="${arc(Math.min(from, a), Math.max(from, a))}" fill="none" stroke-width="3.2" stroke-linecap="round"/>` : "") +
    `<circle class="cap" cx="25" cy="25" r="13.5" stroke-width="1"/>` +
    `<line class="ind" x1="${(25 + 5 * Math.cos(t)).toFixed(2)}" y1="${(25 + 5 * Math.sin(t)).toFixed(2)}" x2="${(25 + 12 * Math.cos(t)).toFixed(2)}" y2="${(25 + 12 * Math.sin(t)).toFixed(2)}" stroke-width="2" stroke-linecap="round"/></svg>`;
}
const showVal = (c, v) => c.bi ? (v - 127 > 0 ? "+" : "") + (v - 127) : c.enum ? String(v + 1) : String(v);
function ctrlHtml(c, i, d) {
  const v = d ? d[c.off] : 0;
  if (c.k) return `<div class="knob ${c.big ? "big" : ""}" data-i="${i}">${knobSvg(c, v)}<div class="kv">${d ? showVal(c, v) : ""}</div><div class="kl">${c.k}</div></div>`;
  if (c.s) return `<div class="sw-b" data-i="${i}"><button class="${v ? "on" : ""}" title="${c.s}"></button><div class="kl">${c.s}</div></div>`;
  if (c.o) return `<div class="sel3" data-i="${i}"><div class="opts">${c.opts.map((o, j) => `<button data-j="${j}" class="${v === j ? "on" : ""}">${o}</button>`).join("")}</div><div class="kl">${c.o}</div></div>`;
  if (c.r) return `<div class="bpm" data-i="${i}"><div class="v">${d ? v : "···"}</div><div class="kl">${c.r}</div></div>`;
  return "";
}
function renderPanel() {
  const el = $("panel");
  const P = PANELS[synth];
  if (!P) { el.innerHTML = ""; return; }
  const on = !!conn && live.ok && !!live.data;
  const d = on ? live.data : null;
  let i = 0;
  el.innerHTML = `<div class="fp ${on ? "" : "off"}">
    <div class="fp-head">
      <div class="fp-logo">${synth.toUpperCase()}<small>SON EN COURS</small></div>
      <div class="fp-led"><span class="d ${on ? "" : "off"}">${on ? (live.slot || "···") : "–––"}</span>
        <span class="nm">${on ? escapeHtml(live.name === INIT_NAME ? "Basic Program · sans nom" : live.name || "sans nom") : (conn ? "lecture…" : "synthé non connecté")}</span>
        ${on && live.edited ? `<span class="pill amber">modifié</span>` : ""}</div>
      <button class="btn sm" id="fpSave" ${on && conn.mode === "midi" && !busy ? "" : "disabled"}>${icon("save")}Sauver</button>
    </div>
    <div class="fp-body">${P.map(sec => `<div class="fp-sec"><h4>${sec.t}</h4><div class="fp-row">${sec.c.map(c => ctrlHtml(c, i++, d)).join("")}</div></div>`).join("")}</div>
    <div class="fp-foot"><span>Tourne un potard ici ou sur le synthé : les deux restent synchronisés.</span><span>Glisser verticalement · Maj pour un réglage fin · molette</span>
    <span>Seuls les réglages vérifiés sur ton Trigon-6 sont affichés.</span></div>
  </div>`;
  if (!on && !conn) el.querySelector(".fp-body").insertAdjacentHTML("beforebegin", `<div class="fp-empty">Allume le ${synth} et branche-le en USB : la façade affichera le son en cours.</div>`);
  $("fpSave").onclick = saveCurrent;
  bindPanel();
}
function updatePanel() {
  const el = $("panel");
  if (!el.querySelector(".fp") || !live.data) return renderPanel();
  const led = el.querySelector(".fp-led");
  if (led) led.innerHTML = `<span class="d">${live.slot || "···"}</span><span class="nm">${escapeHtml(live.name === INIT_NAME ? "Basic Program · sans nom" : live.name || "sans nom")}</span>${live.edited ? `<span class="pill amber">modifié</span>` : ""}`;
  if (el.querySelector(".fp.off")) return renderPanel();
  const list = ctrls();
  el.querySelectorAll("[data-i]").forEach(n => { if (!n.classList.contains("drag")) paintCtrl(n, list[+n.dataset.i]); });
}
function paintCtrl(n, c) {
  const v = live.data[c.off];
  if (c.k) { n.querySelector("svg").outerHTML = knobSvg(c, v); n.querySelector(".kv").textContent = showVal(c, v); bindKnob(n, c); }
  else if (c.s) n.querySelector("button").classList.toggle("on", !!v);
  else if (c.o) n.querySelectorAll("button").forEach(b => b.classList.toggle("on", +b.dataset.j === v));
  else if (c.r) n.querySelector(".v").textContent = v;
}
function sendCtrl(c, v) {
  if (!conn || conn.mode !== "midi" || !live.data) return;
  live.data[c.off] = v; live.holdUntil = Date.now() + 900; live.edited = true;
  const ccv = c.s ? (v ? 127 : 0) : (c.o || c.enum) ? v : Math.round(v * 127 / c.max);
  conn.output.send([0xB0 | (live.chan || 0), c.cc, ccv]);
}
function bindKnob(n, c) {
  const svg = n.querySelector("svg");
  svg.onpointerdown = e => {
    if (!live.data) return;
    e.preventDefault(); svg.setPointerCapture(e.pointerId); n.classList.add("drag");
    const y0 = e.clientY, v0 = live.data[c.off];
    let last = v0;
    svg.onpointermove = m => {
      const range = m.shiftKey ? 600 : 160;
      let v = Math.round(v0 + (y0 - m.clientY) * c.max / range);
      v = Math.max(0, Math.min(c.max, v));
      if (v === last) return;
      last = v; sendCtrl(c, v); paintCtrl(n, c);
    };
    svg.onpointerup = svg.onpointercancel = () => { svg.onpointermove = null; n.classList.remove("drag"); };
  };
  svg.onwheel = e => {
    if (!live.data) return;
    e.preventDefault();
    const step = Math.max(1, Math.round(c.max / 64)) * (e.deltaY < 0 ? 1 : -1);
    sendCtrl(c, Math.max(0, Math.min(c.max, live.data[c.off] + step))); paintCtrl(n, c);
  };
}
function bindPanel() {
  const list = ctrls();
  $("panel").querySelectorAll("[data-i]").forEach(n => {
    const c = list[+n.dataset.i];
    if (c.k) bindKnob(n, c);
    if (c.s) n.querySelector("button").onclick = () => { if (!live.data) return; sendCtrl(c, live.data[c.off] ? 0 : 1); paintCtrl(n, c); };
    if (c.o) n.querySelectorAll("button").forEach(b => b.onclick = () => { if (!live.data) return; sendCtrl(c, +b.dataset.j); paintCtrl(n, c); });
  });
}
