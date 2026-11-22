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
const ctx = load("core.js", "sysex.js", "panel-layouts.js", "panel.js", "panel-check.js", "reorder.js");
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

test("Prophet-6 : nom à la position 107, chaîne vide si absent", () => {
  const d = new Uint8Array(1024);
  ctx.d = d;
  run('synth = "Prophet-6"');
  assert.equal(run("extractName(d)"), "");
  "Smooth Wurl".split("").forEach((c, i) => { d[107 + i] = c.charCodeAt(0); });
  for (let i = 107 + 11; i < 127; i++) d[i] = 32;
  assert.equal(run("extractName(d)"), "Smooth Wurl", "Prophet-6 : nom à la position 107");
});

test("empreinte : 16 caractères hexadécimaux, stable", async () => {
  ctx.d = Uint8Array.from({ length: 1024 }, (_, i) => i & 0xFF);
  const a = await run("hashOf(d)"), b = await run("hashOf(d)");
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.equal(a, b);
});

for (const [name, nameAt] of [["Trigon-6", 116], ["Prophet-6", 107]]) {
  test(`façade ${name} : définitions cohérentes`, () => {
    const ctrls = run(`allCtrls(LAYOUTS["${name}"])`);
    const ids = ctrls.map(c => c.id);
    assert.equal(new Set(ids).size, ids.length, "identifiants uniques");
    const owned = ctrls.filter(c => c.off !== undefined && c.kind !== "display");
    assert.equal(new Set(owned.map(c => c.off)).size, owned.length, "un octet par commande");
    for (const k of ["cc", "nrpn"]) {
      const v = ctrls.filter(c => c[k] !== undefined).map(c => c[k]);
      assert.equal(new Set(v).size, v.length, `un ${k} par commande`);
    }
    for (const c of ctrls) {
      assert.ok(["knob", "switch", "select", "display"].includes(c.kind), `type connu (${c.id})`);
      if (c.off !== undefined) assert.ok(c.off >= 0 && c.off < 1024 && (c.off < nameAt || c.off >= nameAt + 20), `position valide (${c.id})`);
      if (c.kind === "knob") assert.ok(c.max > 0 && c.max <= 255, `maximum valide (${c.id})`);
      if (c.kind === "select") assert.ok(c.opts.length >= 2, `options (${c.id})`);
      if (c.cc !== undefined) assert.ok(c.cc >= 0 && c.cc < 120 && ![0, 6, 32, 38, 98, 99].includes(c.cc), `CC valide (${c.id})`);
    }
  });
}

test("façades : réglages vérifiés sur les machines", () => {
  for (const [name, n] of [["Trigon-6", 30], ["Prophet-6", 35]]) {
    const live = run(`allCtrls(LAYOUTS["${name}"]).filter(c => c.off !== undefined && c.cc !== undefined).length`);
    assert.equal(live, n, `${name} : réglages pilotables vérifiés`);
  }
  assert.ok(run('allCtrls(LAYOUTS["Trigon-6"]).some(c => c.id === "fx.b.mix")'), "potards des effets A et B");
});

test("façade : messages CC et NRPN", () => {
  ctx.c = { kind: "knob", off: 45, max: 164, cc: 102, nrpn: 45 };
  assert.deepEqual(Array.from(run('ctrlMessage(c, 164, "cc", 2)')), [0xB2, 102, 127]);
  assert.deepEqual(Array.from(run('ctrlMessage(c, 164, "nrpn", 0)')), [0xB0, 99, 0, 0xB0, 98, 45, 0xB0, 6, 1, 0xB0, 38, 36]);
  ctx.c = { kind: "switch", off: 1, cc: 65 };
  assert.deepEqual(Array.from(run('ctrlMessage(c, 1, "cc")')), [0xB0, 65, 127]);
  ctx.c = { kind: "display", off: 167, nrpn: 167 };
  assert.deepEqual(Array.from(run('ctrlMessage(c, 250, "nrpn")')).slice(3, 6), [0xB0, 98, 39], "NRPN 167 = 1 x 128 + 39");
});

test("vérification de la façade : valeur de test et position relevée", () => {
  for (const [c, v] of [[{ kind: "knob", max: 127 }, 0], [{ kind: "knob", max: 127 }, 127], [{ kind: "switch" }, 1], [{ kind: "select", opts: ["a", "b", "c"] }, 2], [{ kind: "display", min: 30, max: 250 }, 120]]) {
    ctx.c = c; ctx.v = v;
    const t = run("testValue(c, v)");
    assert.notEqual(t, v, "différente de la valeur actuelle");
    assert.ok(t >= (c.min || 0) && t <= (c.max ?? (c.opts ? c.opts.length - 1 : 1)), "dans la plage");
  }
  const before = new Uint8Array(1024), after = new Uint8Array(1024);
  ctx.before = before; ctx.after = after; ctx.c = { kind: "knob", off: 45, max: 164 };
  assert.equal(run('detectOffset(c, "nrpn", before, after, 123)'), -1, "rien n'a bougé");
  after[45] = 123;
  assert.equal(run('detectOffset(c, "nrpn", before, after, 123)'), 45);
  after[45] = 0; after[52] = 123;
  assert.equal(run('detectOffset(c, "nrpn", before, after, 123)'), 52, "place différente du manuel : relevée");
  after[60] = 1;
  assert.equal(run('detectOffset(c, "nrpn", before, after, 123)'), -1, "deux octets ont bougé : refusé");
  after[60] = 0; after[52] = 122;
  assert.equal(run('detectOffset(c, "nrpn", before, after, 123)'), -1, "NRPN : valeur exacte exigée");
  assert.equal(run('detectOffset(c, "cc", before, after, 123)'), 52, "CC : arrondi toléré");
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
