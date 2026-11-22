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

  // Prophet-6 : réglages tirés du manuel (octet = numéro NRPN), vérifiés sur le synthé avant affichage.
  "Prophet-6": {
    grid: { cols: "repeat(4, minmax(0, 1fr))" },
    blocks: [
      { t: "Oscillateur 1", rows: [[
        kn("p.o1.freq", "Freq", { off: 0, max: 60, cc: 67, nrpn: 0 }), kn("p.o1.shape", "Shape", { off: 3, max: 254, cc: 70, nrpn: 3 }),
        kn("p.o1.pw", "Pulse W", { off: 4, max: 255, cc: 71, nrpn: 4 }), sw("p.o1.sync", "Sync", { off: 1, nrpn: 1 })]] },
      { t: "Oscillateur 2", rows: [[
        kn("p.o2.freq", "Freq", { off: 5, max: 60, cc: 75, nrpn: 5 }), kn("p.o2.fine", "Fine", { off: 6, max: 254, cc: 76, nrpn: 6, bi: 1 }),
        kn("p.o2.shape", "Shape", { off: 8, max: 254, cc: 78, nrpn: 8 }), kn("p.o2.pw", "Pulse W", { off: 9, max: 255, cc: 79, nrpn: 9 })],
        [sw("p.o2.low", "Low freq", { off: 10, nrpn: 10 }), sw("p.o2.key", "Key", { off: 11, nrpn: 11 })]] },
      { t: "Mixeur", rows: [[
        kn("p.mix.o1", "Osc 1", { off: 2, cc: 69, nrpn: 2 }), kn("p.mix.o2", "Osc 2", { off: 7, cc: 77, nrpn: 7 }),
        kn("p.mix.sub", "Sub", { off: 27, cc: 8, nrpn: 27 }), kn("p.mix.noise", "Noise", { off: 32, nrpn: 32 })]] },
      { t: "Glide", rows: [[
        kn("p.gl.rate", "Rate", { off: 30, nrpn: 30 }), { id: "p.gl.mode", kind: "select", label: "Mode", off: 28, cc: 5, nrpn: 28, opts: ["FR", "FRA", "FT", "FTA"] },
        sw("p.gl.on", "On", { off: 29, cc: 65, nrpn: 29 })]] },
      { t: "Passe-bas", rows: [[
        kn("p.lp.cut", "Cutoff", { off: 45, max: 164, cc: 102, nrpn: 45 }), kn("p.lp.res", "Résonance", { off: 46, max: 255, cc: 103, nrpn: 46 }),
        kn("p.lp.env", "Env amt", { off: 77, max: 254, cc: 47, nrpn: 77, bi: 1 })],
        [{ id: "p.lp.key", kind: "select", label: "Clavier", off: 47, cc: 104, nrpn: 47, opts: ["Off", "Half", "Full"], leds: 1 }, sw("p.lp.vel", "Vélocité", { off: 48, cc: 105, nrpn: 48 })]] },
      { t: "Passe-haut", rows: [[
        kn("p.hp.cut", "Cutoff", { off: 49, max: 164, cc: 106, nrpn: 49 }), kn("p.hp.res", "Résonance", { off: 50, max: 255, cc: 107, nrpn: 50 }),
        kn("p.hp.env", "Env amt", { off: 82, max: 254, cc: 54, nrpn: 82, bi: 1 })],
        [{ id: "p.hp.key", kind: "select", label: "Clavier", off: 51, cc: 108, nrpn: 51, opts: ["Off", "Half", "Full"], leds: 1 }, sw("p.hp.vel", "Vélocité", { off: 52, cc: 109, nrpn: 52 })]] },
      { t: "Enveloppe filtre", rows: [[
        kn("p.fe.a", "Attack", { off: 78, cc: 50, nrpn: 78 }), kn("p.fe.d", "Decay", { off: 79, cc: 51, nrpn: 79 }),
        kn("p.fe.s", "Sustain", { off: 80, cc: 52, nrpn: 80 }), kn("p.fe.r", "Release", { off: 81, cc: 53, nrpn: 81 })]] },
      { t: "Ampli", rows: [[
        kn("p.ae.a", "Attack", { off: 67, cc: 43, nrpn: 67 }), kn("p.ae.d", "Decay", { off: 68, cc: 44, nrpn: 68 }),
        kn("p.ae.s", "Sustain", { off: 69, cc: 45, nrpn: 69 }), kn("p.ae.r", "Release", { off: 70, cc: 46, nrpn: 70 })],
        [kn("p.ae.amt", "Env amt", { off: 66, cc: 40, nrpn: 66 }), sw("p.ae.vel", "Vélocité", { off: 71, cc: 41, nrpn: 71 })]] },
      { t: "LFO", rows: [[
        kn("p.lfo.freq", "Freq", { off: 88, max: 254, nrpn: 88 }), kn("p.lfo.amt", "Amount", { off: 89, max: 255, nrpn: 89 }),
        { id: "p.lfo.shape", kind: "select", label: "Forme", off: 90, nrpn: 90, opts: ["Tri", "Saw", "RSaw", "Sqr", "Rnd"] }, sw("p.lfo.sync", "Sync", { off: 91, nrpn: 91 })],
        [sw("p.lfo.f1", "Freq 1", { off: 93, nrpn: 93 }), sw("p.lfo.f2", "Freq 2", { off: 94, nrpn: 94 }), sw("p.lfo.pw", "PW", { off: 95, nrpn: 95 }),
          sw("p.lfo.amp", "Amp", { off: 96, nrpn: 96 }), sw("p.lfo.lp", "LP", { off: 97, nrpn: 97 }), sw("p.lfo.hp", "HP", { off: 98, nrpn: 98 })]] },
      { t: "Poly Mod", rows: [[
        kn("p.pm.fenv", "Env. filtre", { off: 143, max: 254, nrpn: 143, bi: 1 }), kn("p.pm.osc2", "Osc 2", { off: 144, max: 254, nrpn: 144, bi: 1 })],
        [sw("p.pm.f1", "Freq 1", { off: 145, nrpn: 145 }), sw("p.pm.sh1", "Shape 1", { off: 146, nrpn: 146 }), sw("p.pm.pw1", "PW 1", { off: 147, nrpn: 147 }),
          sw("p.pm.lp", "LP", { off: 148, nrpn: 148 }), sw("p.pm.hp", "HP", { off: 149, nrpn: 149 })]] },
      { t: "Effets", rows: [[
        sw("p.fx.on", "On", { off: 135, nrpn: 135 }), { id: "p.fx.a", kind: "select", label: "Type A", off: 119, nrpn: 119, opts: ["Off", "BBD", "DDL", "Chorus", "Ph H", "Ph L"], knobOnly: 1 },
        kn("p.fx.amix", "Mix A", { off: 120, nrpn: 120 }), kn("p.fx.ap1", "Param 1 A", { off: 121, max: 255, nrpn: 121 }), kn("p.fx.ap2", "Param 2 A", { off: 122, nrpn: 122 })],
        [kn("p.fx.btype", "Type B", { off: 127, max: 9, nrpn: 127, enum: 1 }), kn("p.fx.bmix", "Mix B", { off: 128, nrpn: 128 }),
          kn("p.fx.bp1", "Param 1 B", { off: 129, max: 255, nrpn: 129 }), kn("p.fx.bp2", "Param 2 B", { off: 130, nrpn: 130 })]] },
      { t: "Arpégiateur", rows: [[
        sw("p.arp.on", "On", { off: 160, cc: 58, nrpn: 160 }), { id: "p.arp.mode", kind: "select", label: "Mode", off: 161, cc: 59, nrpn: 161, opts: ["Up", "Down", "Up/Dn", "Rand", "Assign"] },
        { id: "p.arp.oct", kind: "select", label: "Octaves", off: 162, cc: 60, nrpn: 162, opts: ["1", "2", "3"] },
        { id: "p.arp.div", kind: "select", label: "Division", off: 163, cc: 62, nrpn: 163, opts: T6_DIVISIONS, knobOnly: 1 }],
        [kn("p.dist", "Distorsion", { off: 64, cc: 9, nrpn: 64 }), kn("p.slop", "Slop", { off: 33, nrpn: 33 }), sw("p.unison", "Unison", { off: 156, nrpn: 156 }),
          { id: "p.bpm", kind: "display", label: "BPM", off: 167, nrpn: 167, min: 30, max: 250 }]] },
    ],
  },
};
