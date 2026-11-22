// Échanges MIDI avec le synthé : réception, attente d'une réponse, lecture d'un programme.
"use strict";

function onMidiMessage(e) {
  const d = e.data;
  const st = d[0] & 0xF0;
  if (st === 0xB0 && d[1] === 32) live.pendingBank = d[2];                 // Bank Select (CC 32)
  else if (st === 0xC0) {                                                 // Program Change
    live.chan = d[0] & 0x0F;
    const b = live.pendingBank ?? live.bank ?? 0;
    live.bank = b; live.pendingBank = null;
    live.slot = keyOf(b, d[1]); live.slotSource = "pc";
    setTimeout(pollEditBuffer, 120);
  }
  for (const w of [...waiters]) if (w.pred(d)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(d); }
}
function waitFor(pred, ms) {
  return new Promise((resolve, reject) => {
    const w = { pred, resolve };
    waiters.push(w);
    setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); reject(new Error("timeout")); } }, ms);
  });
}
async function inquiry() {
  if (conn.mode === "demo") return { id: 0x00, os: "démo" };
  const reply = waitFor(d => d[0] === 0xF0 && d[1] === 0x7E && d[3] === 0x06 && d[4] === 0x02, 1500);
  conn.output.send([0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7]);
  const d = await reply;
  return { id: d[6], os: `${d[10] & 0x0F}.${(d[10] >> 4) & 0x07}` };
}
async function requestProgram(b, p) {
  if (conn.mode === "demo") return demoDump(b, p);
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = waitFor(d => d[0] === 0xF0 && d[1] === 0x01 && d[2] === conn.id && d[3] === 0x02 && d[4] === b && d[5] === p, 2500);
    conn.output.send([0xF0, 0x01, conn.id, 0x05, b, p, 0xF7]);
    try { return await reply; } catch { /* nouvel essai */ }
  }
  throw new Error(`pas de réponse pour ${keyOf(b, p)}`);
}
async function readSlot(b, p) {
  const msg = await requestProgram(b, p);
  const data = unpack(msg.subarray(6, msg.length - 1));
  const k = keyOf(b, p);
  const h = await hashOf(data);
  raw.set(k, msg);
  const s = slot(k);
  if (s.hash && s.hash !== h) s.changedAt = new Date().toISOString();
  s.hash = h;
  s.synthName = extractName(data);
  s.lastRead = new Date().toISOString();
  if (s.protected && s.protectedHash) s.alert = s.protectedHash !== h;
  return s;
}
