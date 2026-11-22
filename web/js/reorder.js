// Réorganisation des banques utilisateur : échanger deux presets, ou en insérer un en décalant les autres.
// Tout est lu et sauvegardé (.syx) avant d'écrire, chaque écriture est relue, et en cas d'échec
// ou d'arrêt demandé, les emplacements déjà réécrits reprennent leur contenu d'origine.
"use strict";

const REORDER_MODES = ["swap", "shift"];
// Réglages propres à l'app qui suivent leur preset quand il change de place.
const META = ["name", "type", "notes", "protected", "protectedHash", "protectedRaw", "protectedAt", "alert"];
const key3 = n => String(n).padStart(3, "0");

/* ---------- Plan (fonction pure) ---------- */
// Renvoie la liste des écritures [destination, source] pour déplacer `from` vers `to`.
// swap  : les deux presets échangent leur place.
// shift : `from` va en `to`, ceux qui sont entre les deux se décalent d'un cran pour boucher le trou.
function planMove(from, to, mode) {
  const a = +from, b = +to;
  if (!REORDER_MODES.includes(mode)) throw new Error(`mode inconnu : ${mode}`);
  if (![a, b].every(n => Number.isInteger(n) && n >= 0 && n < 500)) throw new Error("emplacements utilisateur uniquement (000 à 499)");
  if (a === b) return [];
  if (mode === "swap") return [[key3(b), key3(a)], [key3(a), key3(b)]];
  const dir = a < b ? 1 : -1, plan = [];
  for (let n = a; n !== b; n += dir) plan.push([key3(n), key3(n + dir)]);
  plan.push([key3(b), key3(a)]);
  return plan;
}

/* ---------- Exécution ---------- */
const canReorder = () => !!conn && !busy && !!db;
const metaOf = k => Object.fromEntries(META.filter(f => db.slots[k]?.[f] !== undefined).map(f => [f, db.slots[k][f]]));
function setMeta(k, m) { const s = slot(k); for (const f of META) delete s[f]; Object.assign(s, m); }
const dataOf = k => { const m = raw.get(k); return unpack(m.subarray(6, m.length - 1)); };

async function reorder(from, to, mode) {
  const plan = planMove(from, to, mode);
  if (!plan.length || !canReorder()) return;
  const keys = [...new Set(plan.map(([d]) => d))].sort();
  busy = true; cancelRequested = false; setBusyUi(true);
  const done = [];   // destinations déjà réécrites, pour pouvoir revenir en arrière
  let orig = null, file = null, editBuffer = null;
  try {
    // 1. état exact du synthé pour tous les emplacements concernés
    for (const [i, k] of keys.entries()) { await readSlot(+k[0], +k.slice(1)); setProgress(i + 1, keys.length, "Lecture"); }
    orig = new Map(keys.map(k => [k, { data: dataOf(k), meta: metaOf(k) }]));
    // 2. copie de sécurité groupée, avant toute écriture
    const bytes = new Uint8Array(keys.reduce((n, k) => n + raw.get(k).length, 0));
    let o = 0; for (const k of keys) { bytes.set(raw.get(k), o); o += raw.get(k).length; }
    const label = `${synth} ${keys.length} programmes avant ${mode === "swap" ? "échange" : "déplacement"} ${from} vers ${to}`;
    const j = await postSyx("backup", bytes, label);
    if (j) { file = j.file; db.backups.push({ date: new Date().toISOString(), file: j.name, label, count: keys.length }); }
    else if (conn.mode !== "demo") throw new Error("copie de sécurité impossible, rien n'a été écrit");
    // 3. son en cours : écrire un programme le remplace, on le remet à la fin
    editBuffer = await requestEditBuffer();
    // 4. écritures vérifiées
    for (const [i, [dst, src]] of plan.entries()) {
      if (cancelRequested) throw new Error("arrêt demandé");
      done.push(dst);   // avant l'écriture : un échec en cours d'écriture est aussi annulé
      setMeta(dst, orig.get(src).meta);
      await writeVerified(dst, orig.get(src).data);
      delete slot(dst).changedAt;
      setProgress(i + 1, plan.length, mode === "swap" ? "Échange" : "Décalage");
    }
    followMovedSound(plan);
    selected = to; bank = +to[0];
    toast(`${mode === "swap" ? `${from} et ${to} échangés` : `${from} déplacé en ${to}, ${plan.length - 1} preset(s) décalé(s)`} · ${plan.length} écritures vérifiées`);
  } catch (e) {
    const back = orig ? await rollback(done, orig) : true;
    toast(back ? `Réorganisation annulée (${e.message}) : tout est revenu comme avant.`
      : `Réorganisation interrompue (${e.message}). Les originaux sont dans ${file || "Sauvegardes/"}.`);
  }
  try { await restoreEditBuffer(editBuffer); } catch { /* le son en cours reste celui du dernier programme écrit */ }
  for (const k of keys) cleanSlot(k);
  busy = false; setBusyUi(false); render(); scheduleSave();
}

// Remet le contenu et les réglages d'origine des emplacements déjà réécrits.
async function rollback(done, orig) {
  let ok = true;
  setProgressText("Retour à l'état d'origine…");
  for (const k of done.reverse()) {
    setMeta(k, orig.get(k).meta);
    try { await writeVerified(k, orig.get(k).data); delete slot(k).changedAt; } catch { ok = false; }
  }
  return ok;
}

// Le son joué a peut-être changé de place : on le suit.
function followMovedSound(plan) {
  const moved = plan.find(([, src]) => src === live.slot);
  if (moved) { live.slot = moved[0]; live.slotSource = "guess"; }
}

/* ---------- Glisser-déposer dans la grille ---------- */
let dragFrom = null, bankHoverTimer = null;

function initReorder() {
  const clear = () => document.querySelectorAll(".cell.drop, .cell.dragging").forEach(c => c.classList.remove("drop", "dragging"));
  const target = e => {
    const c = e.target.closest?.("#grid .cell[data-k]");
    return c && dragFrom && isUser(+c.dataset.k[0]) && c.dataset.k !== dragFrom ? c : null;
  };
  document.addEventListener("dragstart", e => {
    const c = e.target.closest?.("#grid .cell[data-k]");
    if (!c) return;
    if (!canReorder() || !isUser(+c.dataset.k[0])) { e.preventDefault(); return; }
    dragFrom = c.dataset.k;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragFrom);
    c.classList.add("dragging");
  });
  document.addEventListener("dragover", e => {
    if (!dragFrom) return;
    const c = target(e);
    if (c) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }
    document.querySelectorAll(".cell.drop").forEach(x => x !== c && x.classList.remove("drop"));
    c?.classList.add("drop");
    // Survoler un numéro de banque utilisateur l'affiche, pour déposer dans une autre banque.
    const bk = e.target.closest?.(".bank[data-b]");
    if (bk && isUser(+bk.dataset.b) && +bk.dataset.b !== bank) {
      if (!bankHoverTimer) bankHoverTimer = setTimeout(() => { bankHoverTimer = null; bank = +bk.dataset.b; renderGrid(); }, 450);
    } else if (!bk) { clearTimeout(bankHoverTimer); bankHoverTimer = null; }
  });
  document.addEventListener("drop", e => {
    const c = target(e), from = dragFrom;
    dragFrom = null; clear();
    if (!c) return;
    e.preventDefault();
    askReorder(from, c.dataset.k);
  });
  document.addEventListener("dragend", () => { dragFrom = null; clear(); clearTimeout(bankHoverTimer); bankHoverTimer = null; });
}

async function askReorder(from, to) {
  const nm = k => { const s = db.slots[k]; return escapeHtml(isEmpty(s) ? "sans nom" : displayName(s) || "pas encore lu"); };
  const a = +from, b = +to, lo = key3(Math.min(a, b) + (a < b ? 1 : 0)), hi = key3(Math.max(a, b) - (a > b ? 1 : 0));
  const shifted = Math.abs(a - b);
  const shiftText = a < b ? `les presets ${lo} à ${hi} reculent d'un cran` : `les presets ${lo} à ${hi} avancent d'un cran`;
  const seconds = n => n * (conn.mode === "demo" ? 0.05 : 0.6);
  let mode = REORDER_MODES.includes(loadPref("reorder", "swap")) ? loadPref("reorder", "swap") : "swap";
  const ok = await askConfirm({
    title: `Déplacer ${from} « ${nm(from)} »`,
    html: `<div class="choice">
        <label class="opt"><input type="radio" name="rmode" value="swap"><span><b>Échanger avec ${to}</b>
          <span>${from} ↔ ${to} « ${nm(to)} » · 2 emplacements réécrits</span></span></label>
        <label class="opt"><input type="radio" name="rmode" value="shift"><span><b>Insérer en ${to}</b>
          <span>${shifted === 1 ? `revient à échanger avec ${to}` : `${shiftText}`} · ${shifted + 1} emplacements réécrits, environ ${Math.ceil(seconds(shifted + 1) + 1)} s</span></span></label>
      </div>
      <div class="sub">Une copie .syx des emplacements concernés est faite avant. Chaque écriture est relue : en cas de problème, tout revient comme avant. Protections, types et notes suivent leur preset, et le son en cours sur le synthé est conservé.</div>`,
    ok: "Réorganiser",
    onOpen: () => document.querySelectorAll('input[name="rmode"]').forEach(r => {
      r.checked = r.value === mode;
      r.onchange = () => { mode = r.value; };
    }),
  });
  if (!ok) return;
  savePref("reorder", mode);
  await reorder(from, to, mode);
}
