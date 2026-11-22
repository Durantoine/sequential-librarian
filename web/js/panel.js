// Façade : dessin du synthé (panel-layouts.js) synchronisé avec le son en cours.
// Une commande est « active » quand on connaît son octet : vérifié d'avance, confirmé par la
// vérification (panel-check.js), ou appris en touchant le réglage sur le synthé.
"use strict";

const layout = () => LAYOUTS[synth];
const panelMethod = () => db?.panelCheck?.method || layout()?.fixed || null;
const panelChecked = () => !!panelMethod();
let fxSide = "a";          // effet affiché par les potards de la section Effets (comme le bouton A/B)
let learning = null;       // { id, base, cand, hits, t0 } pendant un apprentissage

/* ---------- Commandes ---------- */
// Toutes les commandes d'une façade, « fx.@ » développé en A et B.
function allCtrls(L = layout()) {
  const out = [];
  const walk = it => {
    if (it.items) { it.items.flat().forEach(walk); return; }
    if (!it.id || it.kind === "deco") return;
    if (it.id.includes("@")) for (const s of ["a", "b"]) out.push({ ...it, id: it.id.replace("@", s) });
    else out.push(it);
  };
  (L?.blocks || []).forEach(b => b.rows.flat().forEach(walk));
  return out;
}
const byId = id => allCtrls().find(c => c.id === id);
// Commande utilisable : octet connu, et CC ou NRPN si elle peut être pilotée. null sinon.
function resolve(c) {
  if (!c?.id || c.kind === "deco") return null;
  if (c.of) { const t = resolve(byId(c.of)); return t && { ...c, off: t.off, send: false }; }
  const L = layout(), learned = db?.panelLearn?.[c.id], check = db?.panelCheck;
  // une vérification faite sur ce synthé prime sur les positions connues d'avance
  if (check?.at?.[c.id] !== undefined) return { ...c, off: check.at[c.id], send: c.kind !== "display" && (check.method === "nrpn" ? c.nrpn !== undefined : c.cc !== undefined) };
  if (!check && L.fixed && c.off !== undefined) return { ...c, send: c.cc !== undefined && c.kind !== "display" };
  if (learned !== undefined) {
    const cc = L.fixed ? L.ccAt?.[learned] : undefined;
    return { ...c, off: learned, cc, nrpn: undefined, send: cc !== undefined, learned: true };
  }
  return null;
}
const sideId = id => id.replace("@", fxSide);

/* ---------- Valeurs ---------- */
const lo = c => c.min || 0;
const hiOf = c => c.kind === "select" ? c.opts.length - 1 : c.kind === "switch" ? 1 : c.max;
const center = c => Math.floor(c.max / 2);
function valText(c, v) {
  if (v === undefined) return "";
  if (c.kind === "select") return c.opts[v] ?? String(v);
  if (c.codes) return c.codes[v] ?? String(v);
  if (c.bi) { const d = v - center(c); return (d > 0 ? "+" : "") + d; }
  return String(v);
}

/* ---------- Dessin ---------- */
const A0 = -150, A1 = 150;
function arc(a, b, r) {
  const pt = x => { const t = (x - 90) * Math.PI / 180; return [25 + r * Math.cos(t), 25 + r * Math.sin(t)]; };
  const [x0, y0] = pt(a), [x1, y1] = pt(b);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
// Potard noir cranté, graduations autour, index blanc. f = position de 0 à 1 (null : inconnue).
function knobSvg(f, bi) {
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const t = (A0 + i * (A1 - A0) / 10 - 90) * Math.PI / 180;
    return `<line x1="${(25 + 20.5 * Math.cos(t)).toFixed(2)}" y1="${(25 + 20.5 * Math.sin(t)).toFixed(2)}" x2="${(25 + 23.5 * Math.cos(t)).toFixed(2)}" y2="${(25 + 23.5 * Math.sin(t)).toFixed(2)}"/>`;
  }).join("");
  let ind = "", val = "";
  if (f !== null) {
    const a = A0 + Math.max(0, Math.min(1, f)) * (A1 - A0), t = (a - 90) * Math.PI / 180, from = bi ? 0 : A0;
    if (Math.abs(a - from) > .5) val = `<path class="val" d="${arc(Math.min(from, a), Math.max(from, a), 18.2)}"/>`;
    ind = `<line class="ind" x1="${(25 + 6 * Math.cos(t)).toFixed(2)}" y1="${(25 + 6 * Math.sin(t)).toFixed(2)}" x2="${(25 + 14 * Math.cos(t)).toFixed(2)}" y2="${(25 + 14 * Math.sin(t)).toFixed(2)}"/>`;
  }
  return `<svg viewBox="0 0 50 50"><g class="tk">${ticks}</g>${val}<circle class="skirt" cx="25" cy="25" r="16.5"/><circle class="cap" cx="25" cy="25" r="13"/>${ind}</svg>`;
}
function ctrlHtml(it, d) {
  switch (it.kind) {
    case "num": return `<div class="hw-num">${it.label}</div>`;
    case "stack": return `<div class="hw-stack">${it.items.map(r => `<div class="hw-row">${r.map(x => ctrlHtml(x, d)).join("")}</div>`).join("")}</div>`;
    case "sub": return `<div class="hw-sub"><h5>${it.t}</h5><div class="hw-row">${it.items.map(x => ctrlHtml(x, d)).join("")}</div></div>`;
    case "abswitch": return `<div class="hw-sw ab" data-ab="1"><span class="led on"></span><button title="Choisir l'effet réglé par les potards">${fxSide.toUpperCase()}</button><div class="kl">${it.label}</div></div>`;
    case "program": return `<div class="hw-prog"><div class="seg">${conn && live.ok ? (live.slot || "···") : "–––"}</div><div class="kl">Bank · Program</div></div>`;
    case "deco": return it.knob ? `<div class="hw-knob deco" title="${escapeHtml(it.title || "")}">${knobSvg(.5)}<div class="kl">${it.label}</div></div>`
      : `<div class="hw-sw deco" title="${escapeHtml(it.title || "Se règle sur le synthé")}">${"<button></button>".repeat(it.button || 1)}<div class="kl">${it.label}</div></div>`;
  }
  const c = it.id.includes("@") ? { ...it, id: sideId(it.id) } : it;
  const r = resolve(c), v = r && d ? d[r.off] : undefined;
  const st = !r ? "idle" : r.send ? "live" : "ro";
  const cls = `${st} ${learning?.id === c.id ? "learning" : ""}`;
  const tip = !r ? "Pas encore relié : clique, puis touche ce réglage sur le synthé pour l'apprendre"
    : !r.send ? `Affiché seulement${r.learned ? " (appris, ⌥ clic pour oublier)" : ""} : le synthé ne reçoit pas ce réglage en CC` : "";
  const attrs = `data-id="${c.id}" title="${escapeHtml(tip)}"`;
  if (c.kind === "knob") {
    const f = v === undefined ? null : (v - lo(c)) / (c.max - lo(c));
    return `<div class="hw-knob ${cls}" ${attrs}>${knobSvg(f, c.bi)}<div class="kl">${c.label}</div><div class="kv">${valText(c, v)}</div></div>`;
  }
  if (c.kind === "switch") return `<div class="hw-sw ${cls} ${c.wave ? "wave" : ""}" ${attrs}><span class="led ${v ? "on" : ""}"></span><button></button><div class="kl">${c.label}</div></div>`;
  if (c.kind === "display") return `<div class="hw-disp ${cls}" ${attrs}><div class="seg">${v === undefined ? "···" : escapeHtml(valText(c, v))}</div>${c.label ? `<div class="kl">${c.label}</div>` : ""}</div>`;
  if (c.kind === "select") {
    const leds = c.knobOnly ? "" : `<div class="hw-leds ${c.ring ? "ring" : ""} ${c.cols === 2 ? "two" : ""}">${c.opts.map((o, j) => `<button data-j="${j}" class="${v === j ? "on" : ""}"><span class="led ${v === j ? "on" : ""}"></span>${o}</button>`).join("")}</div>`;
    const knob = c.leds ? "" : `<div class="hw-knob sel">${knobSvg(v === undefined ? null : v / Math.max(1, c.opts.length - 1))}${c.knobOnly ? `<div class="kv on">${valText(c, v)}</div>` : ""}</div>`;
    return `<div class="hw-select ${cls} ${c.ring ? "ring" : ""} ${c.leds ? "ledsonly" : ""}" ${attrs}>${c.ring ? leds + knob : knob + leds}<div class="kl">${c.label}</div></div>`;
  }
  return "";
}

function renderPanel() {
  const el = $("panel"), L = layout();
  if (!L) { el.innerHTML = ""; return; }
  const on = !!conn && live.ok && !!live.data;
  const d = on ? live.data : null;
  const g = L.grid;
  el.innerHTML = `<div class="fp hw ${on ? "" : "off"} ${L.grid.areas ? "areas" : ""}">
    <div class="fp-head">
      <div class="fp-logo">${synth.toUpperCase()}</div>
      <div class="fp-led"><span class="d ${on ? "" : "off"}">${on ? (live.slot || "···") : "–––"}</span>
        <span class="nm">${on ? escapeHtml(live.name === INIT_NAME ? "Basic Program · sans nom" : live.name || "sans nom") : (conn ? "lecture…" : "synthé non connecté")}</span>
        ${on && live.edited ? `<span class="pill amber">modifié</span>` : ""}</div>
      <button class="btn sm" id="fpSave" ${on && conn.mode === "midi" && !busy ? "" : "disabled"}>${icon("save")}Sauver</button>
      <button class="btn sm ghost" id="fpWide" title="Masquer la barre latérale pour agrandir la façade">${document.body.classList.contains("wide") ? "Réduire" : "Agrandir"}</button>
    </div>
    ${panelNotice()}
    <div class="fp-scale"><div class="hw-grid" style="${escapeHtml(`grid-template-columns:${g.cols};${g.areas ? `grid-template-areas:${g.areas.join(" ")}` : ""}`)}">
      ${L.blocks.map(b => `<section class="hw-blk" ${b.area ? `style="grid-area:${b.area}"` : ""}>${b.t ? `<h4>${b.t}</h4>` : ""}${b.rows.map(r => `<div class="hw-row">${r.map(x => ctrlHtml(x, d)).join("")}</div>`).join("")}</section>`).join("")}
    </div></div>
    <div class="fp-foot"><span>Glisser verticalement · Maj pour un réglage fin · molette</span>
      ${conn?.mode === "midi" && !busy && layout().fixed ? `<button class="btn sm ghost" id="fpCheck" title="Teste chaque réglage sur ce synthé et relève sa position">Revérifier sur le synthé</button>` : ""}
      <span>Les réglages grisés ne sont pas encore reliés : clique-les, puis touche le même réglage sur le synthé.</span></div>
  </div>`;
  if (!on && !conn) el.querySelector(".fp-scale").insertAdjacentHTML("beforebegin", `<div class="fp-empty">Allume le ${synth} et branche-le en USB : la façade affichera le son en cours.</div>`);
  $("fpSave").onclick = saveCurrent;
  $("fpWide").onclick = () => { const w = !document.body.classList.contains("wide"); document.body.classList.toggle("wide", w); savePref("wide", w ? "1" : ""); renderPanel(); };
  $("fpCheck") && ($("fpCheck").onclick = checkPanel);
  bindPanel();
  fitPanel();
}
// La façade garde ses proportions : on la réduit pour qu'elle tienne dans la largeur disponible.
function fitPanel() {
  const box = $("panel").querySelector(".fp-scale"), grid = box?.firstElementChild;
  if (!grid) return;
  grid.style.transform = "none";
  const k = Math.min(1.25, box.clientWidth / grid.offsetWidth);
  grid.style.transform = `scale(${k.toFixed(4)})`;
  box.style.height = `${Math.ceil(grid.offsetHeight * k)}px`;
}

function updatePanel() {
  const el = $("panel");
  if (!el.querySelector(".fp") || el.querySelector(".fp.off") || !live.data) return renderPanel();
  const led = el.querySelector(".fp-led");
  if (led) led.innerHTML = `<span class="d">${live.slot || "···"}</span><span class="nm">${escapeHtml(live.name === INIT_NAME ? "Basic Program · sans nom" : live.name || "sans nom")}</span>${live.edited ? `<span class="pill amber">modifié</span>` : ""}`;
  const seg = el.querySelector(".hw-prog .seg"); if (seg) seg.textContent = live.slot || "···";
  el.querySelectorAll("[data-id]").forEach(n => { if (!n.classList.contains("drag")) paint(n); });
}
function paint(n) {
  const c = byId(n.dataset.id), r = resolve(c);
  if (!r || !live.data) return;
  const tmp = document.createElement("div");
  tmp.innerHTML = ctrlHtml(c, live.data);
  const fresh = tmp.firstElementChild;
  n.replaceWith(fresh);
  bindCtrl(fresh);
}

/* ---------- Envoi ---------- */
// Message MIDI qui règle `c` sur la valeur d'octet `v` (fonction pure).
function ctrlMessage(c, v, method, ch = 0) {
  const st = 0xB0 | ch;
  if (method === "nrpn") return [st, 99, c.nrpn >> 7, st, 98, c.nrpn & 0x7F, st, 6, v >> 7, st, 38, v & 0x7F];
  const ccv = c.kind === "switch" ? (v ? 127 : 0) : (c.kind === "select" || c.enum) ? v : Math.round(v * 127 / c.max);
  return [st, c.cc, ccv];
}
function setCtrl(r, v) {
  if (!conn || conn.mode !== "midi" || !live.data || !r.send) return;
  v = Math.max(lo(r), Math.min(hiOf(r), v));
  if (v === live.data[r.off]) return;
  live.data[r.off] = v; live.holdUntil = Date.now() + 900; live.edited = true;
  conn.output.send(ctrlMessage(r, v, r.learned ? "cc" : panelMethod(), live.chan || 0));
}

/* ---------- Interaction ---------- */
function bindPanel() { $("panel").querySelectorAll("[data-id], [data-ab]").forEach(bindCtrl); }
function bindCtrl(n) {
  if (!n) return;
  if (n.dataset.ab) { n.querySelector("button").onclick = () => { fxSide = fxSide === "a" ? "b" : "a"; renderPanel(); }; return; }
  const c = byId(n.dataset.id), r = resolve(c);
  n.onclick = e => {
    if (e.altKey && r?.learned) { forgetLearn(c); return; }
    if (!r && !e.target.closest("[data-j]")) startLearn(c);
  };
  if (!r || !r.send) return;
  if (c.kind === "switch") n.querySelector("button").onclick = e => { if (!e.altKey) { setCtrl(r, live.data[r.off] ? 0 : 1); paint(n); } };
  n.querySelectorAll("[data-j]").forEach(b => b.onclick = e => { e.stopPropagation(); setCtrl(r, +b.dataset.j); paint(n); });
  const svg = n.querySelector(".hw-knob svg, :scope > svg");
  if (!svg || (c.kind === "select" && c.leds)) return;
  const steps = c.kind === "select" ? c.opts.length - 1 : null;
  svg.onpointerdown = e => {
    if (!live.data) return;
    e.preventDefault(); svg.setPointerCapture(e.pointerId); n.classList.add("drag");
    const y0 = e.clientY, v0 = live.data[r.off];
    svg.onpointermove = m => {
      const range = steps ? 18 * steps : (m.shiftKey ? 600 : 160);
      const span = steps || (r.max - lo(r));
      setCtrl(r, Math.round(v0 + (y0 - m.clientY) * span / range));
      const k = n.querySelector(".kv"); if (k) k.textContent = valText(r, live.data[r.off]);
      const f = steps ? live.data[r.off] / steps : (live.data[r.off] - lo(r)) / (r.max - lo(r));
      svg.innerHTML = knobSvg(f, r.bi).replace(/^<svg[^>]*>|<\/svg>$/g, "");
    };
    svg.onpointerup = svg.onpointercancel = () => { svg.onpointermove = null; n.classList.remove("drag"); paint(n); };
  };
  svg.onwheel = e => {
    if (!live.data) return;
    e.preventDefault();
    const step = steps ? 1 : Math.max(1, Math.round((r.max - lo(r)) / 64));
    setCtrl(r, live.data[r.off] + (e.deltaY < 0 ? step : -step)); paint(n);
  };
}

/* ---------- Apprentissage ---------- */
// On note le son en cours, puis on attend qu'un seul octet change (deux relectures de suite).
function startLearn(c) {
  if (!conn || conn.mode !== "midi" || !live.data || busy) { toast("Branche le synthé pour relier ce réglage"); return; }
  learning = { id: c.id, base: Uint8Array.from(live.data), cand: -1, hits: 0, t0: Date.now() };
  toast(`Touche « ${c.label} » sur le ${synth} (bouton ou potard)…`);
  renderPanel();
}
function forgetLearn(c) {
  delete db.panelLearn[c.id]; scheduleSave(); toast(`« ${c.label} » n'est plus relié`); renderPanel();
}
function learnTick(data) {
  if (!learning) return;
  const c = byId(learning.id);
  if (Date.now() - learning.t0 > 25000) { learning = null; toast("Aucun changement reçu : réessaie en tournant le réglage sur le synthé"); renderPanel(); return; }
  const changed = [];
  for (let i = 0; i < data.length; i++) if (data[i] !== learning.base[i] && (i < 116 || i >= 136)) changed.push(i);
  if (changed.length !== 1) { if (changed.length > 1) { learning.base = Uint8Array.from(data); learning.cand = -1; } return; }
  const at = changed[0];
  learning.hits = at === learning.cand ? learning.hits + 1 : 1; learning.cand = at;
  if (learning.hits < 2) return;
  const owner = allCtrls().find(x => x.id !== c.id && resolve(x)?.off === at && x.kind !== "display");
  if (owner) { toast(`Ça, c'est « ${owner.label} ». Touche « ${c.label} »`); learning.base = Uint8Array.from(data); learning.cand = -1; return; }
  (db.panelLearn ||= {})[c.id] = at;
  learning = null; scheduleSave();
  toast(`« ${c.label} » est relié${resolve(c).send ? " et pilotable" : " (affiché seulement)"}`);
  renderPanel();
}

function setView(v) {
  if (v === "panel" && !LAYOUTS[synth]) v = "grid";
  view = v; savePref("view", v);
  if (v !== "panel") learning = null;
  document.body.classList.toggle("v-panel", v === "panel");
  render();
  if (v === "panel") pollEditBuffer();
}
