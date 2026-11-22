// Vérification de la façade sur le synthé branché : pour chaque réglage, on envoie une valeur
// de test (NRPN, sinon CC), on relit le son en cours et on garde le réglage seulement si un
// seul octet a changé, vers la valeur demandée. Cet octet devient la position du réglage :
// la façade reste juste même si le manuel se trompe de place. Le son en cours est remis à la fin.
"use strict";

let baseMsg = null;   // son en cours au début de la vérification (message 0x03)

// Valeur de test, différente de la valeur actuelle et dans la plage du réglage (fonction pure).
function testValue(c, v) {
  if (c.kind === "switch") return v ? 0 : 1;
  if (c.kind === "select") return (v + 1) % c.opts.length;
  const lo = c.min || 0, hi = c.max;
  return v > (lo + hi) / 2 ? Math.round(lo + (hi - lo) / 4) : Math.round(lo + 3 * (hi - lo) / 4);
}
// Position confirmée du réglage, ou -1 : un seul octet a bougé, vers la valeur demandée (fonction pure).
// En CC, une valeur 0-127 est remise à l'échelle par le synthé : on tolère l'arrondi.
function detectOffset(c, method, before, after, want) {
  const changed = [];
  for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) changed.push(i);
  if (changed.length !== 1) return -1;
  const at = changed[0], tol = method === "cc" && c.kind === "knob" && !c.enum ? Math.ceil(c.max / 127) : 0;
  return Math.abs(after[at] - want) <= tol ? at : -1;
}
const canSend = (c, m) => m === "nrpn" ? c.nrpn !== undefined : c.cc !== undefined && c.kind !== "display";

async function tryCtrl(c, method, base) {
  const want = testValue(c, base[c.off ?? 0]);
  conn.output.send(ctrlMessage(c, want, method, live.chan || 0));
  await sleep(140);
  const m = await requestEditBuffer(1500);
  const after = unpack(m.subarray(4, m.length - 1));
  const at = detectOffset(c, method, base, after, want);
  // on remet le son d'origine avant le réglage suivant, pour tester toujours depuis le même son
  if (!after.every((v, i) => v === base[i])) await restoreEditBuffer(baseMsg);
  return at;
}

async function checkPanel() {
  if (!conn || conn.mode !== "midi" || busy || !LAYOUTS[synth]) return;
  const list = allCtrls().filter(c => c.cc !== undefined || c.nrpn !== undefined);
  busy = true; cancelRequested = false; setBusyUi(true);
  const at = {}, fail = [];
  let method = layout().fixed || null;
  try {
    baseMsg = await requestEditBuffer();
    const base = unpack(baseMsg.subarray(4, baseMsg.length - 1));
    if (base.length !== 1024) throw new Error("son en cours illisible");
    for (const [i, c] of list.entries()) {
      if (cancelRequested) throw new Error("arrêt demandé");
      setProgress(i + 1, list.length, "Vérification de la façade");
      // Tant que la méthode n'est pas connue, on essaie NRPN puis CC sur chaque réglage.
      const tries = (method ? [method] : ["nrpn", "cc"]).filter(m => canSend(c, m));
      let found = -1;
      for (const m of tries) { found = await tryCtrl(c, m, base); if (found >= 0) { method = m; break; } }
      if (found >= 0) at[c.id] = found; else fail.push(c.id);
    }
    if (!method) throw new Error(`aucun réglage confirmé : vérifie GLOBALS > Param Rcv sur le ${synth}`);
    const n = Object.keys(at).length, moved = list.filter(c => at[c.id] !== undefined && c.off !== undefined && at[c.id] !== c.off).length;
    if (!layout().fixed) {
      db.panelCheck = { date: new Date().toISOString(), method, at, fail };
      // Le manuel du Prophet-6 place le nom en NRPN 236 à 255 : on le confirme de la même façon.
      const nameAt = method === "nrpn" && synth === "Prophet-6" ? await tryCtrl({ kind: "knob", off: 236, nrpn: 236, min: 32, max: 125 }, "nrpn", base) : -1;
      if (nameAt >= 0) { db.panelCheck.nameAt = nameAt; NAME_AT[synth] = nameAt; }
    }
    toast(`Façade vérifiée : ${n} réglages confirmés${fail.length ? `, ${fail.length} masqués` : ""}${moved ? `, ${moved} à une autre place que dans le manuel` : ""} (${method.toUpperCase()})`);
  } catch (e) {
    toast(`Vérification interrompue : ${e.message}`);
  }
  try { await restoreEditBuffer(baseMsg); } catch { /* le son en cours garde la dernière valeur de test */ }
  baseMsg = null;
  busy = false; setBusyUi(false); scheduleSave(); render();
  return { method, at, fail };
}

// Bandeau au-dessus de la façade : à vérifier, ou réglages masqués.
function panelNotice() {
  if (layout().fixed) return "";
  const pc = db?.panelCheck, total = allCtrls().filter(c => c.cc !== undefined || c.nrpn !== undefined).length;
  const can = conn?.mode === "midi" && !busy;
  if (!pc) return `<div class="fp-note">Cette façade vient du manuel du ${synth}. Avant de l'afficher, l'app vérifie chaque réglage sur ton synthé
    (environ ${Math.ceil(total * 0.5)} s) : elle envoie une valeur de test, relit le son et remet ton son à la fin.
    <button class="btn sm primary" id="fpCheck" ${can ? "" : "disabled"}>Vérifier sur le synthé</button>${can ? "" : " <span>Branche le synthé en USB.</span>"}</div>`;
  const hidden = total - Object.keys(pc.at || {}).length;
  return hidden ? `<div class="fp-note">${hidden} réglage(s) masqué(s) : le synthé ne les a pas confirmés${pc.method === "cc" ? ". Règle GLOBALS > Param Rcv sur NRPN pour piloter aussi le LFO, le Poly Mod et les effets" : ""}.
    <button class="btn sm" id="fpCheck" ${can ? "" : "disabled"}>Revérifier</button></div>` : "";
}
