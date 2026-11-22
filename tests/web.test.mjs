// Tests des fonctions pures de l'interface (format SysEx, façade, réorganisation).
// Lancement : make test   (ou node --test tests/*.test.mjs)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ROOT = new URL("..", import.meta.url).pathname;
function load(...files) {
  const ctx = vm.createContext({ console, crypto: globalThis.crypto, btoa, atob, TextEncoder, setTimeout, clearTimeout });
  for (const f of files) vm.runInContext(fs.readFileSync(ROOT + "web/js/" + f, "utf8"), ctx, { filename: f });
  return ctx;
}
const ctx = load("core.js", "sysex.js", "panel.js", "reorder.js");
const run = code => vm.runInContext(code, ctx);

test("compression 7 bits : aller-retour sur un programme complet", () => {
  const data = Uint8Array.from({ length: 1024 }, (_, i) => (i * 37 + (i >> 3)) & 0xFF);
  ctx.data = data;
  const packed = run("packData(data)");
  assert.equal(packed.length, 1171, "1024 octets donnent 1171 octets compressés");
  assert.ok(packed.every(b => b < 0x80), "aucun octet compressé n'a le bit 7");
  ctx.packed = packed;
  assert.deepEqual(Array.from(run("unpack(packed)")), Array.from(data));
});

test("nom du programme lu à la position 116 (Trigon-6)", () => {
  const d = new Uint8Array(1024);
  "Let It Go Bassline  ".split("").forEach((c, i) => { d[116 + i] = c.charCodeAt(0); });
  ctx.d = d;
  run('synth = "Trigon-6"');
  assert.equal(run("extractName(d)"), "Let It Go Bassline");
});

test("nom introuvable : chaîne vide plutôt qu'une erreur", () => {
  ctx.d = new Uint8Array(1024);
  run('synth = "Prophet-6"');
  assert.equal(run("extractName(d)"), "");
});

test("empreinte : 16 caractères hexadécimaux, stable", async () => {
  ctx.d = Uint8Array.from({ length: 1024 }, (_, i) => i & 0xFF);
  const a = await run("hashOf(d)"), b = await run("hashOf(d)");
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.equal(a, b);
});

test("façade Trigon-6 : définitions cohérentes", () => {
  const ctrls = run('PANELS["Trigon-6"].flatMap(s => s.c)');
  const offs = ctrls.map(c => c.off), ccs = ctrls.filter(c => c.cc !== undefined).map(c => c.cc);
  assert.equal(new Set(offs).size, offs.length, "un octet par commande");
  assert.equal(new Set(ccs).size, ccs.length, "un CC par commande");
  for (const c of ctrls) {
    assert.ok(c.off >= 0 && c.off < 1024, `position valide (${c.off})`);
    if (c.k) assert.ok(c.max > 0 && c.max <= 255, `maximum valide (${c.k})`);
    if (c.cc !== undefined) assert.ok(c.cc >= 0 && c.cc < 120, `CC valide (${c.cc})`);
    assert.ok(c.off < 116 || c.off >= 136, "ne touche pas au nom");
  }
});

// Applique un plan d'écritures à une banque fictive (chaque emplacement contient son numéro d'origine).
function applyPlan(plan) {
  const before = Object.fromEntries(Array.from({ length: 500 }, (_, n) => [String(n).padStart(3, "0"), n]));
  const after = { ...before };
  for (const [dst, src] of plan) after[dst] = before[src];
  return after;
}

test("réorganisation : échange de deux presets", () => {
  const plan = run('planMove("003", "041", "swap")');
  assert.equal(plan.length, 2);
  const r = applyPlan(plan);
  assert.equal(r["003"], 41); assert.equal(r["041"], 3); assert.equal(r["010"], 10);
});

test("réorganisation : insertion vers le début, les autres avancent d'un cran", () => {
  const r = applyPlan(run('planMove("045", "002", "shift")'));
  assert.equal(r["002"], 45);
  for (let n = 3; n <= 45; n++) assert.equal(r[String(n).padStart(3, "0")], n - 1);
  assert.equal(r["001"], 1); assert.equal(r["046"], 46);
});

test("réorganisation : insertion vers la fin, les autres reculent d'un cran", () => {
  const r = applyPlan(run('planMove("010", "215", "shift")'));
  assert.equal(r["215"], 10);
  for (let n = 10; n < 215; n++) assert.equal(r[String(n).padStart(3, "0")], n + 1);
  assert.equal(r["216"], 216);
});

test("réorganisation : aucun preset perdu ni dupliqué", () => {
  for (const [a, b] of [["000", "499"], ["499", "000"], ["120", "121"], ["121", "120"]]) {
    for (const mode of ["swap", "shift"]) {
      const plan = run(`planMove("${a}", "${b}", "${mode}")`);
      const dst = plan.map(([d]) => d).sort(), src = plan.map(([, s]) => s).sort();
      assert.deepEqual(dst, src, `${mode} ${a} vers ${b} : mêmes emplacements lus et écrits`);
      assert.equal(new Set(dst).size, dst.length, "chaque emplacement écrit une seule fois");
    }
  }
  assert.deepEqual(Array.from(run('planMove("007", "007", "shift")')), []);
});

test("réorganisation : refuse les banques d'usine et les modes inconnus", () => {
  assert.throws(() => run('planMove("010", "512", "swap")'));
  assert.throws(() => run('planMove("600", "010", "shift")'));
  assert.throws(() => run('planMove("010", "011", "rotate")'));
});
