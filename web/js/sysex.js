// Format SysEx Sequential : compression 7 bits, nom du programme, empreinte. Fonctions pures.
"use strict";

/* ---------- SysEx ---------- */
function unpack(p) {
  const out = [];
  for (let i = 0; i < p.length; i += 8) {
    const msb = p[i];
    for (let j = 1; j < 8 && i + j < p.length; j++) out.push(p[i + j] | (((msb >> (j - 1)) & 1) << 7));
  }
  return Uint8Array.from(out);
}
function packData(d) {
  const out = [];
  for (let i = 0; i < d.length; i += 7) {
    const chunk = d.slice(i, i + 7);
    let msb = 0;
    chunk.forEach((v, j) => { msb |= ((v >> 7) & 1) << j; });
    out.push(msb, ...Array.from(chunk, v => v & 0x7F));
  }
  return out;
}
function extractName(d) {
  const read = o => {
    let s = "";
    for (let i = o; i < o + 20; i++) { const c = d[i]; if (c < 32 || c > 126) return null; s += String.fromCharCode(c); }
    return s.trimEnd();
  };
  const at = NAME_AT[synth];
  if (at !== null && at !== undefined) { const n = read(at); if (n !== null) return n; }
  for (let o = 0; o <= 300; o++) { const n = read(o); if (n && /^[A-Za-z0-9]/.test(n) && !/<<<|>>>/.test(n)) return n; }
  return "";
}
async function hashOf(u8) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", u8));
  return Array.from(h.slice(0, 8), x => x.toString(16).padStart(2, "0")).join("");
}
const b64 = u8 => { let s = ""; u8.forEach(c => s += String.fromCharCode(c)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
