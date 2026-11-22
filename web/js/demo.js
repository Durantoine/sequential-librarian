// Mode démo : synthé simulé, sans matériel.
"use strict";

/* ---------- Mode démo ---------- */
const demoState = { overrides: new Map(), written: new Map(), current: [0, 12], timer: null };
async function demoEditBuffer() {
  const [b, p] = demoState.current;
  const m = await demoDump(b, p);
  return Uint8Array.from([0xF0, 0x01, 0x00, 0x03, ...m.subarray(6)]);
}
function demoStartPlaying() {
  demoState.timer = setInterval(() => {
    const b = Math.floor(Math.random() * 5), p = Math.floor(Math.random() * 100);
    demoState.current = [b, p];
    live.slot = keyOf(b, p); live.slotSource = "pc";        // comme un Program Change reçu
    pollEditBuffer();
  }, 6000);
}
function demoDb() {
  const d = emptyDb();
  d.slots["012"] = { name: "", type: "pad", notes: "Exemple de preset à protéger" };
  d.slots["105"] = { name: "Basse ronde", type: "basse" };
  return d;
}
function demoData(seed) {
  let x = (seed * 2654435761) >>> 0 || 1;
  const d = new Uint8Array(1024);
  for (let i = 0; i < 1024; i++) { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; d[i] = x & 0xFF; }
  return d;
}
async function demoDump(b, p) {
  await sleep(3);
  const k = keyOf(b, p);
  let seed = b >= 5 ? (b - 5) * 100 + p : b * 100 + p;
  if (b < 5 && (b * 100 + p) % 7 === 3) seed += 10000;   // presets utilisateur modifiés
  if (demoState.overrides.has(k)) seed = demoState.overrides.get(k);
  if (demoState.written.has(k) && !demoState.overrides.has(k)) return Uint8Array.from([0xF0, 0x01, 0x00, 0x02, b, p, ...packData(demoState.written.get(k)), 0xF7]);
  const data = demoData(seed);
  const w1 = ["Velvet", "Dusty", "Glass", "Warm", "Night", "Analog", "Hollow", "Bright", "Deep", "Silk"];
  const w2 = ["Brass", "Pad", "Lead", "Bass", "Choir", "Sweep", "Bells", "Strings", "Pluck", "Drone"];
  const nm = (seed >= 10000 && seed < 99999 && p % 3 === 0) ? INIT_NAME : `${w1[seed % 10]} ${w2[(seed >> 3) % 10]}`;
  const pos = NAME_AT[synth] ?? 116;
  for (let i = 0; i < 20; i++) data[pos + i] = nm.padEnd(20).charCodeAt(i);
  return Uint8Array.from([0xF0, 0x01, 0x00, 0x02, b, p, ...packData(data), 0xF7]);
}
