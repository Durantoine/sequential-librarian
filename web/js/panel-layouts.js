// Façades dessinées comme les synthés : blocs, rangées et commandes (données uniquement).
//
// Commande : { id, kind, label, ... }
//   kind  : knob (potard), switch (bouton à LED), select (choix parmi des LED), display (afficheur),
//           deco (élément du synthé qui n'appartient pas au preset : volume général, transposition…)
//   off   : octet du son en cours, s'il est connu ; cc / nrpn : message qui le règle
//   max, min, bi (potard centré), opts (valeurs d'un select, dans l'ordre des octets)
// Une commande sans `off` peut être apprise : on la touche sur le synthé et l'app repère l'octet.
"use strict";

const OCTAVES = ["-2", "-1", "0", "+1", "+2"];
const T6_DIVISIONS = ["Half", "Qtr", "8th", "8th D", "8th S", "8th T", "16th", "16th S", "16th T", "32nd"];
const T6_FX = ["Off", "bbd", "ddl", "CHO", "PH1", "PH2", "HAL", "rOO", "PLA", "SPr"];
const sw = (id, label, extra = {}) => ({ id, kind: "switch", label, ...extra });
const kn = (id, label, extra = {}) => ({ id, kind: "knob", label, max: 127, ...extra });

const LAYOUTS = {
  // Trigon-6. Méthode « cc » : tous les `off` ci-dessous ont été vérifiés sur la machine.
  "Trigon-6": {
    fixed: "cc",
    // Octets dont le CC est vérifié : une commande apprise à cet octet devient pilotable.
    ccAt: { 5: 70, 6: 78 },
    grid: { cols: "repeat(6, auto)", areas: ['"vol lfo osc flt clk fx"', '"at pm osc amp clk arp"', '"at bot bot bot bot bot"'] },
    blocks: [
      { area: "vol", t: "Volume", rows: [[{ id: "master", kind: "deco", label: "", knob: 1, title: "Volume général : réglage du synthé, pas du preset" }]] },
      { area: "at", t: "After touch", rows: [
        [kn("at.amt", "Amount", { max: 254, bi: 1 })],
        [sw("at.f1", "Freq 1"), sw("at.f2", "Freq 2"), sw("at.f3", "Freq 3")],
        [sw("at.flt", "Filter"), sw("at.amp", "Amp"), sw("at.lfo", "LFO")],
        [sw("at.fxa", "FX Mix A"), sw("at.fxb", "FX Mix B")],
      ] },
      { area: "lfo", t: "LFO", rows: [
        [kn("lfo.freq", "Frequency", { max: 254 }), sw("lfo.sync", "LFO Sync"),
          { id: "lfo.shape", kind: "select", label: "Shape", opts: ["Triangle", "Sawtooth", "Rev Saw", "Square", "Random"] },
          kn("lfo.amt", "Amount", { max: 255 })],
        [sw("lfo.f1", "Freq 1"), sw("lfo.f2", "Freq 2"), sw("lfo.f3", "Freq 3"), sw("lfo.pw1", "PW 1"),
          sw("lfo.pw2", "PW 2"), sw("lfo.pw3", "PW 3"), sw("lfo.flt", "Filter"), sw("lfo.amp", "Amp")],
      ] },
      { area: "pm", t: "Polymod", rows: [
        [kn("pm.osc3", "Osc 3 amount", { max: 254, bi: 1 }), kn("pm.fenv", "Filter env", { max: 254, bi: 1 }),
          { kind: "stack", items: [[sw("pm.f1", "Freq 1"), sw("pm.f2", "Freq 2"), sw("pm.f3", "Freq 3")], [sw("pm.pw1", "PW 1"), sw("pm.pw2", "PW 2"), sw("pm.fdbk", "Fdbk")]] },
          sw("pm.flt", "Filter")],
      ] },
      { area: "osc", t: "Oscillators", rows: [
        [{ kind: "num", label: "1" }, { id: "osc1.oct", kind: "select", label: "Octave", off: 0, cc: 67, opts: OCTAVES, ring: 1 },
          sw("osc2.sync", "Sync Osc 2"), sw("osc1.tri", "∧", { wave: 1 }), sw("osc1.saw", "◿", { wave: 1 }), sw("osc1.pulse", "⊓", { wave: 1, off: 8, cc: 71 }),
          kn("osc1.pw", "Pulse width", { max: 255 }), kn("osc1.vol", "Volume", { off: 17, cc: 69 }),
          kn("osc1.fd", "Fdbk ◂ ▸ Drive", { off: 28, cc: 106, max: 254, bi: 1 })],
        [{ kind: "num", label: "2" }, { id: "osc2.oct", kind: "select", label: "Octave", off: 1, cc: 75, opts: OCTAVES, ring: 1 },
          kn("osc2.pitch", "Pitch", { max: 254, bi: 1 }), sw("osc2.tri", "∧", { wave: 1 }), sw("osc2.saw", "◿", { wave: 1 }), sw("osc2.pulse", "⊓", { wave: 1, off: 9, cc: 79 }),
          kn("osc2.pw", "Pulse width", { max: 255 }), kn("osc2.vol", "Volume", { off: 18, cc: 77 }), kn("noise", "Noise")],
        [{ kind: "num", label: "3" }, { id: "osc3.oct", kind: "select", label: "Octave", opts: ["LO", ...OCTAVES], ring: 1 },
          kn("osc3.pitch", "Pitch", { max: 254, bi: 1 }), sw("osc3.tri", "∧", { wave: 1 }), sw("osc3.saw", "◿ ◺", { wave: 1 }), sw("osc3.pulse", "⊓", { wave: 1 }),
          kn("osc3.pw", "Pulse width", { max: 255 }), kn("osc3.vol", "Volume"), sw("osc3.kbd", "Keyboard")],
      ] },
      { area: "flt", t: "Filter", rows: [
        [kn("flt.cut", "Cutoff", { off: 29, cc: 102, max: 164 }), kn("flt.res", "Resonance", { off: 30, cc: 103, max: 255 }),
          kn("flt.env", "Env amt", { off: 36, cc: 47, max: 254, bi: 1 }), sw("flt.2pole", "2 Pole", { off: 33, cc: 107 }),
          { id: "flt.key", kind: "select", label: "Keyboard", off: 31, cc: 104, opts: ["Off", "Half", "Full"], leds: 1 }],
        [kn("fenv.a", "Attack", { off: 40, cc: 50 }), kn("fenv.d", "Decay", { off: 42, cc: 51 }), kn("fenv.s", "Sustain", { off: 44, cc: 52 }),
          kn("fenv.r", "Release", { off: 46, cc: 53 }), sw("flt.vel", "Velocity", { off: 32, cc: 105 })],
      ] },
      { area: "amp", t: "Amplifier", rows: [
        [kn("aenv.a", "Attack", { off: 41, cc: 43 }), kn("aenv.d", "Decay", { off: 43, cc: 44 }), kn("aenv.s", "Sustain", { off: 45, cc: 45 }),
          kn("aenv.r", "Release", { off: 47, cc: 46 }), sw("amp.vel", "Velocity", { off: 48, cc: 41 })],
      ] },
      { area: "clk", t: "Clock", rows: [
        [{ id: "clk.bpm.d", kind: "display", label: "BPM", off: 98 }],
        [{ id: "clk.div", kind: "select", label: "Divide", off: 103, cc: 62, opts: T6_DIVISIONS, cols: 2 }],
        [kn("clk.bpm", "BPM", { off: 98, cc: 3, min: 30, max: 250 })],
        [{ id: "tap", kind: "deco", label: "Tap", button: 1, title: "Tap tempo : se règle sur le synthé" }],
      ] },
      { area: "fx", t: "Effects", ab: 1, rows: [
        [sw("fx.on", "On/Off"), { id: "fx.a.type.d", kind: "display", label: "A", of: "fx.a.type", codes: T6_FX },
          { id: "fx.b.type.d", kind: "display", label: "B", of: "fx.b.type", codes: T6_FX }, { kind: "abswitch", label: "A / B" },
          { id: "fx.@.type", kind: "select", label: "Type", opts: T6_FX, knobOnly: 1 }],
        [kn("fx.@.p1", "Param 1", { max: 255 }), kn("fx.@.p2", "Param 2"), sw("fx.@.sync", "Sync"), kn("fx.@.mix", "Dry ◂ ▸ Wet")],
      ] },
      { area: "arp", t: "Arpeggiator", rows: [
        [sw("arp.on", "On/Off", { off: 102, cc: 58 }),
          { id: "arp.oct", kind: "select", label: "Octaves", off: 101, cc: 60, opts: ["1", "2", "3"] },
          { id: "arp.mode", kind: "select", label: "Mode", off: 100, cc: 59, opts: ["Up", "Down", "Up/Down", "Random", "Assign"] },
          { kind: "sub", t: "Sequencer", items: [{ id: "seq.play", kind: "deco", label: "Play", button: 1 }, { id: "seq.rec", kind: "deco", label: "Record", button: 1 }] }],
      ] },
      { area: "bot", t: "", rows: [
        [{ id: "tr", kind: "deco", label: "Transpose", button: 2, title: "Transposition : réglage du synthé" },
          { id: "hold", kind: "deco", label: "Hold", button: 1 },
          kn("glide.rate", "Glide rate", { off: 23, cc: 5 }), sw("glide.on", "Glide", { off: 25, cc: 65 }), sw("unison", "Unison"),
          { kind: "program" },
          kn("dist", "Distortion", { off: 63, cc: 9 }), kn("vintage", "Vintage"), kn("pan", "Pan spread"), kn("pgmvol", "Pgm volume")],
      ] },
    ],
  },

  // Prophet-6. Méthode « cc » : les `off` ci-dessous ont été relevés sur la machine par la
  // vérification (le manuel donne d'autres positions, inexactes). `nrpn` : numéros du manuel,
  // utilisés seulement si l'on relance la vérification avec Param Rcv = NRPN.
  "Prophet-6": {
    fixed: "cc",
    grid: { cols: "repeat(8, auto)", areas: ['"vol pm fx clk o1 arp lp fenv"', '"vol lfo lfo lfo o2 mix hp aenv"', '"vol bot bot bot bot bot bot bot"'] },
    blocks: [
      { area: "vol", t: "", rows: [
        [{ id: "p.master", kind: "deco", label: "Master vol", knob: 1, title: "Volume général : réglage du synthé, pas du preset" }],
        [kn("p.dist", "Distort", { off: 58, cc: 9, nrpn: 64 })],
      ] },
      { area: "pm", t: "Poly mod", rows: [
        [kn("p.pm.fenv", "Filter env", { max: 254, bi: 1, nrpn: 143 }), kn("p.pm.osc2", "Osc 2", { max: 254, bi: 1, nrpn: 144 })],
        [sw("p.pm.f1", "Freq 1", { nrpn: 145 }), sw("p.pm.sh1", "Shape 1", { nrpn: 146 }), sw("p.pm.pw1", "PW 1", { nrpn: 147 }), sw("p.pm.lp", "Filter", { nrpn: 148 })],
      ] },
      { area: "fx", t: "Effects", ab: 1, rows: [
        [sw("p.fx.on", "On/Off", { nrpn: 135 }), { id: "p.fx.a.type.d", kind: "display", label: "A", of: "p.fx.a.type" },
          { id: "p.fx.b.type.d", kind: "display", label: "B", of: "p.fx.b.type" }, { kind: "abswitch", label: "A / B" }],
        [kn("p.fx.@.type", "Type", { max: 9, enum: 1 }), kn("p.fx.@.mix", "Mix"), kn("p.fx.@.p1", "Param 1", { max: 255 }), kn("p.fx.@.p2", "Param 2"), sw("p.fx.@.sync", "Clock sync")],
      ] },
      { area: "clk", t: "Clock", rows: [
        [{ id: "p.bpm.d", kind: "display", label: "BPM", min: 30, max: 250, nrpn: 167 }],
        [{ id: "p.tap", kind: "deco", label: "Tap tempo", button: 1 }],
        [{ id: "p.arp.div", kind: "select", label: "Value", off: 92, cc: 62, nrpn: 163, opts: T6_DIVISIONS, knobOnly: 1 }],
      ] },
      { area: "o1", t: "Oscillator 1", rows: [
        [kn("p.o1.freq", "Frequency", { max: 60, nrpn: 0 }), sw("p.o1.sync", "Sync", { nrpn: 1 }),
          kn("p.o1.shape", "Shape", { off: 3, max: 254, cc: 70, nrpn: 3 }), kn("p.o1.pw", "Pulse width", { off: 5, max: 255, cc: 71, nrpn: 4 })],
      ] },
      { area: "arp", t: "Arpeggiator", rows: [
        [sw("p.arp.on", "On/Off", { off: 91, cc: 58, nrpn: 160 }),
          { id: "p.arp.oct", kind: "select", label: "Octaves", off: 90, cc: 60, nrpn: 162, opts: ["1", "2", "3"] },
          { id: "p.arp.mode", kind: "select", label: "Mode", off: 89, cc: 59, nrpn: 161, opts: ["Up", "Down", "Up/Down", "Random", "Assign"] }],
        [kn("p.slop", "Slop", { nrpn: 33 })],
      ] },
      { area: "lp", t: "Low-pass filter", rows: [
        [kn("p.lp.cut", "Cutoff", { off: 19, max: 164, cc: 102, nrpn: 45 }), kn("p.lp.res", "Resonance", { off: 20, max: 255, cc: 103, nrpn: 46 }),
          kn("p.lp.env", "Env amt", { off: 29, max: 254, cc: 47, nrpn: 77, bi: 1 })],
        [sw("p.lp.vel", "Velocity", { off: 22, cc: 105, nrpn: 48 }), { id: "p.lp.key", kind: "select", label: "Keyboard", off: 21, cc: 104, nrpn: 47, opts: ["Off", "Half", "Full"], leds: 1 }],
      ] },
      { area: "fenv", t: "Filter envelope", rows: [
        [kn("p.fe.a", "Attack", { off: 35, cc: 50, nrpn: 78 }), kn("p.fe.d", "Decay", { off: 37, cc: 51, nrpn: 79 }),
          kn("p.fe.s", "Sustain", { off: 39, cc: 52, nrpn: 80 }), kn("p.fe.r", "Release", { off: 41, cc: 53, nrpn: 81 })],
      ] },
      { area: "lfo", t: "Low frequency oscillator", rows: [
        [kn("p.lfo.freq", "Frequency", { max: 254, nrpn: 88 }), sw("p.lfo.sync", "LFO sync", { nrpn: 91 }),
          { id: "p.lfo.shape", kind: "select", label: "Shape", nrpn: 90, opts: ["Triangle", "Sawtooth", "Rev Saw", "Square", "Random"] },
          kn("p.lfo.amt", "Initial amt", { max: 255, nrpn: 89 }),
          sw("p.lfo.f1", "Freq 1", { nrpn: 93 }), sw("p.lfo.f2", "Freq 2", { nrpn: 94 }), sw("p.lfo.pw", "PW 1+2", { nrpn: 95 }),
          sw("p.lfo.amp", "Amp", { nrpn: 96 }), sw("p.lfo.lp", "Filter", { nrpn: 97 })],
      ] },
      { area: "o2", t: "Oscillator 2", rows: [
        [kn("p.o2.freq", "Frequency", { max: 60, nrpn: 5 }), kn("p.o2.fine", "Fine", { off: 2, max: 254, cc: 76, nrpn: 6, bi: 1 }),
          kn("p.o2.shape", "Shape", { off: 4, max: 254, cc: 78, nrpn: 8 }), kn("p.o2.pw", "Pulse width", { off: 6, max: 255, cc: 79, nrpn: 9 })],
        [sw("p.o2.low", "Low freq", { nrpn: 10 }), sw("p.o2.key", "Keyboard", { nrpn: 11 })],
      ] },
      { area: "mix", t: "Mixer", rows: [
        [kn("p.mix.o1", "Osc 1", { off: 7, cc: 69, nrpn: 2 }), kn("p.mix.o2", "Osc 2", { off: 8, cc: 77, nrpn: 7 })],
        [kn("p.mix.sub", "Sub octave", { off: 9, cc: 8, nrpn: 27 }), kn("p.mix.noise", "Noise", { nrpn: 32 })],
      ] },
      { area: "hp", t: "High-pass filter", rows: [
        [kn("p.hp.cut", "Cutoff", { off: 23, max: 164, cc: 106, nrpn: 49 }), kn("p.hp.res", "Resonance", { off: 24, max: 255, cc: 107, nrpn: 50 }),
          kn("p.hp.env", "Env amt", { off: 30, max: 254, cc: 54, nrpn: 82, bi: 1 })],
        [sw("p.hp.vel", "Velocity", { off: 26, cc: 109, nrpn: 52 }), { id: "p.hp.key", kind: "select", label: "Keyboard", off: 25, cc: 108, nrpn: 51, opts: ["Off", "Half", "Full"], leds: 1 }],
      ] },
      { area: "aenv", t: "Amplifier", rows: [
        [kn("p.ae.a", "Attack", { off: 36, cc: 43, nrpn: 67 }), kn("p.ae.d", "Decay", { off: 38, cc: 44, nrpn: 68 }),
          kn("p.ae.s", "Sustain", { off: 40, cc: 45, nrpn: 69 }), kn("p.ae.r", "Release", { off: 42, cc: 46, nrpn: 70 })],
        [kn("p.ae.amt", "Env amt", { off: 31, cc: 40, nrpn: 66 }), sw("p.ae.vel", "Velocity", { off: 43, cc: 41, nrpn: 71 })],
      ] },
      { area: "bot", t: "", rows: [
        [{ id: "p.tr", kind: "deco", label: "Transpose", button: 2 }, { id: "p.hold", kind: "deco", label: "Hold", button: 1 },
          kn("p.gl.rate", "Glide rate", { off: 14, cc: 5, nrpn: 30 }), sw("p.gl.on", "Glide", { off: 16, cc: 65, nrpn: 29 }),
          { id: "p.gl.mode", kind: "select", label: "Glide mode", nrpn: 28, opts: ["FR", "FRA", "FT", "FTA"], knobOnly: 1 },
          sw("p.unison", "Unison", { nrpn: 156 }), { kind: "program" }],
      ] },
    ],
  },
};
