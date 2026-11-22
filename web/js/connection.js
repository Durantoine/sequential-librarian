// Connexion MIDI : automatique ou manuelle, branchement et débranchement.
"use strict";

/* ---------- Connexion ---------- */
async function ensureMidi() {
  if (midi) return true;
  if (!navigator.requestMIDIAccess) { toast("Ce navigateur ne gère pas le MIDI : il faut Chrome."); return false; }
  try { midi = await navigator.requestMIDIAccess({ sysex: true }); }
  catch { toast("Accès MIDI refusé. Autorise-le dans les réglages du site (icône à gauche de l'adresse)."); return false; }
  midi.onstatechange = fillPorts;
  return true;
}
function fillPorts() {
  const re = SYNTHS[synth].match;
  for (const [sel, ports] of [[$("selIn"), midi.inputs], [$("selOut"), midi.outputs]]) {
    const prev = sel.value;
    sel.innerHTML = "";
    let auto = null;
    ports.forEach(p => { sel.add(new Option(p.name, p.id)); if (!auto && re.test(p.name)) auto = p.id; });
    if (!sel.options.length) sel.add(new Option("Aucun port MIDI", ""));
    sel.value = [...sel.options].some(o => o.value === prev) ? prev : (auto || sel.options[0].value);
  }
}
async function openConnBox() {
  if (!(await ensureMidi())) return;
  if (conn?.mode === "demo") { conn = null; stopLive(); await loadDb(); }
  fillPorts();
  $("connBox").classList.toggle("show");
  render();
}
async function verifyConnection(quiet = false) {
  const input = midi.inputs.get($("selIn").value), output = midi.outputs.get($("selOut").value);
  if (!input || !output) { toast("Choisis l'entrée et la sortie du synthé"); return; }
  if (conn?.input) conn.input.onmidimessage = null;
  conn = { mode: "midi", input, output, id: null };
  input.onmidimessage = onMidiMessage;
  try {
    const info = await inquiry();
    conn.id = info.id;
    db.device = { id: info.id, os: info.os, port: output.name };
    $("connBox").classList.remove("show");
    const expect = SYNTHS[synth].expectId;
    if (!quiet || expect !== info.id) toast(`Connecté à ${output.name}` + (expect !== info.id ? ` · attention, ce n'est peut-être pas un ${synth}` : ""));
    startLive();
  } catch {
    if (conn?.input) conn.input.onmidimessage = null;
    conn = null; stopLive();
    toast("Pas de réponse du synthé. Vérifie GLOBALS > 8 MIDI SysEx = USB.");
  }
  render();
}
// Connexion automatique : au chargement, et quand le synthé est branché ou allumé.
let autoTried = false;
async function autoConnect(quiet = true) {
  if (conn || busy || !navigator.requestMIDIAccess) return;
  if (!midi) { try { midi = await navigator.requestMIDIAccess({ sysex: true }); midi.onstatechange = onPortsChanged; } catch { return; } }
  const re = SYNTHS[synth].match;
  let inp = null, out = null;
  midi.inputs.forEach(x => { if (!inp && re.test(x.name) && x.state !== "disconnected") inp = x; });
  midi.outputs.forEach(x => { if (!out && re.test(x.name) && x.state !== "disconnected") out = x; });
  if (!inp || !out) { if (!quiet) toast(`${synth} introuvable en USB`); return; }
  fillPorts(); $("selIn").value = inp.id; $("selOut").value = out.id;
  await verifyConnection(quiet);
  if (conn?.mode === "midi") scanAll();
}
let portTimer = null;
function onPortsChanged() {
  fillPorts();
  clearTimeout(portTimer);
  portTimer = setTimeout(() => {
    if (conn?.mode === "midi" && conn.output.state === "disconnected") { conn = null; stopLive(); render(); toast(`${synth} débranché`); }
    if (!conn) autoConnect();
  }, 800);
}
// Lit tout le synthé (environ 15 s) pour avoir les noms à jour partout.
async function scanAll() {
  await readRange(rangeBanks(0, 9), "Lecture du synthé", { quiet: true });
}

async function startDemo() {
  if (conn?.input) conn.input.onmidimessage = null;
  stopLive();
  conn = { mode: "demo", id: 0 };
  demoState.overrides.clear(); demoState.written.clear(); demoState.current = [0, 12];
  $("connBox").classList.remove("show");
  await loadDb();
  render();
  startLive(); demoStartPlaying();
  toast("Mode démo : clique sur « Tout relire » pour lire le synthé simulé");
}
