#!/usr/bin/env python3
"""Génère le device Max for Live « Presets Sequential.amxd » à partir de m4l/device.js.

    make device     (ou python3 scripts/build_device.py)

Le device est écrit dans build/ et copié dans le dossier maxForLiveDir de config.json.
Le chemin du dossier de données (dataDir) est inscrit dans le code du device.
"""
import json
import shutil
import struct
from pathlib import Path

import config

M4L = config.ROOT / "m4l"
NAME = "Presets Sequential"
OUT = config.ROOT / "build" / f"{NAME}.amxd"
CFG = config.load()
W, H = 330.0, 169.0

BG = [0.086, 0.09, 0.102, 1.0]
INK = [0.9, 0.906, 0.918, 1.0]
INK2 = [0.70, 0.714, 0.745, 1.0]
MUTED = [0.486, 0.502, 0.541, 1.0]
LINE = [0.2, 0.208, 0.235, 1.0]

boxes, lines = [], []


def box(id_, **kw):
    b = {"id": id_, **kw}
    boxes.append({"box": b})
    return id_


def obj(id_, text, ins, outs, rect, outtypes=None):
    return box(id_, maxclass="newobj", text=text, numinlets=ins, numoutlets=outs,
               outlettype=outtypes or [""] * outs, patching_rect=rect)


def msg(id_, text, rect):
    return box(id_, maxclass="message", text=text, numinlets=2, numoutlets=1, outlettype=[""], patching_rect=rect)


def wire(src, so, dst, di):
    lines.append({"patchline": {"source": [src, so], "destination": [dst, di]}})


def label(id_, text, prect, size, color, font="Ableton Sans Medium", just=0, rect=None):
    return box(id_, maxclass="comment", text=text, numinlets=1, numoutlets=0,
               patching_rect=rect or [700.0, 40.0 + 30 * len(boxes), prect[2], prect[3]],
               presentation=1, presentation_rect=prect, fontsize=size, fontname=font,
               textcolor=color, textjustification=just)


def button(id_, text, prect, rect):
    return box(id_, maxclass="live.text", text=text, texton=text, mode=0, parameter_enable=0,
               numinlets=1, numoutlets=2, outlettype=["", ""], patching_rect=rect,
               presentation=1, presentation_rect=prect)


code = (M4L / "device.js").read_text("utf-8").replace("__VAULT__", str(CFG.data_dir).rstrip("/"))

# Moteur : tout le MIDI de la piste traverse le code, qui le renvoie tel quel.
obj("midiin", "midiin", 1, 1, [30.0, 30.0, 50.0, 22.0], ["int"])
box("code", maxclass="v8.codebox", code=code, filename="none", numinlets=1, numoutlets=5,
    outlettype=[""] * 5, patching_rect=[30.0, 200.0, 520.0, 300.0], fontname="<Monospaced>", fontsize=11.0,
    saved_object_attributes={"parameter_enable": 0})
obj("midiout", "midiout", 1, 0, [30.0, 540.0, 55.0, 22.0])
obj("thisdev", "live.thisdevice", 1, 3, [200.0, 30.0, 90.0, 22.0], ["bang", "int", "int"])
msg("m_init", "init", [200.0, 70.0, 35.0, 22.0])
msg("m_on", "1", [250.0, 70.0, 25.0, 22.0])
obj("metro", "metro 700", 2, 1, [250.0, 100.0, 70.0, 22.0], ["bang"])
msg("m_tick", "tick", [250.0, 130.0, 35.0, 22.0])

wire("midiin", 0, "code", 0)
wire("code", 0, "midiout", 0)
wire("thisdev", 0, "m_init", 0)
wire("thisdev", 0, "m_on", 0)
wire("m_init", 0, "code", 0)
wire("m_on", 0, "metro", 0)
wire("metro", 0, "m_tick", 0)
wire("m_tick", 0, "code", 0)

# Interface (vue de présentation)
box("bg", maxclass="panel", numinlets=1, numoutlets=0, patching_rect=[700.0, 10.0, 60.0, 30.0],
    presentation=1, presentation_rect=[0.0, 0.0, W, H], bgcolor=BG, mode=0, background=1)
box("sep", maxclass="panel", numinlets=1, numoutlets=0, patching_rect=[770.0, 10.0, 60.0, 5.0],
    presentation=1, presentation_rect=[10.0, 118.0, W - 20, 1.0], bgcolor=LINE, mode=0)
box("b_synth", maxclass="live.text", text="Trigon-6", texton="Prophet-6", mode=1, parameter_enable=1,
    numinlets=1, numoutlets=2, outlettype=["", ""], patching_rect=[640.0, 30.0, 70.0, 22.0],
    presentation=1, presentation_rect=[10.0, 6.0, 72.0, 18.0], varname="synth",
    saved_attribute_attributes={"valueof": {"parameter_longname": "Synthé", "parameter_shortname": "Synthé",
        "parameter_type": 2, "parameter_mmax": 1.0, "parameter_enum": ["Trigon-6", "Prophet-6"],
        "parameter_initial_enable": 1, "parameter_initial": [0], "parameter_invisible": 1}})
msg("m_synth", "synth $1", [640.0, 60.0, 60.0, 22.0])
wire("b_synth", 0, "m_synth", 0)
wire("m_synth", 0, "code", 0)
label("l_status", "", [90.0, 8.0, W - 100, 16.0], 8.5, MUTED, just=2)
label("l_num", "–––", [8.0, 26.0, 120.0, 34.0], 24.0, INK, font="Menlo")
label("l_name", "", [10.0, 62.0, W - 20, 24.0], 14.0, INK2, font="Menlo")
label("l_info", "", [10.0, 90.0, W - 20, 18.0], 9.0, MUTED)
button("b_prev", "◀  Préc.", [10.0, 132.0, 80.0, 22.0], [400.0, 30.0, 70.0, 22.0])
button("b_next", "Suiv.  ▶", [96.0, 132.0, 80.0, 22.0], [480.0, 30.0, 70.0, 22.0])

for bid, word, x in (("b_prev", "prev", 400.0), ("b_next", "next", 480.0)):
    sel = obj(f"sel_{word}", "sel 1", 2, 2, [x, 60.0, 40.0, 22.0], ["bang", ""])
    m = msg(f"m_{word}", word, [x, 90.0, 50.0, 22.0])
    wire(bid, 0, sel, 0)
    wire(sel, 0, m, 0)
    wire(m, 0, "code", 0)

# Bouton « Ouvrir l'app » : node.script lance le serveur (qui ouvre Chrome), puis s'arrête.
button("b_app", "Ouvrir l'app", [W - 96, 132.0, 86.0, 22.0], [640.0, 120.0, 80.0, 22.0])
obj("sel_app", "sel 1", 2, 2, [640.0, 150.0, 40.0, 22.0], ["bang", ""])
msg("m_start", "script start", [640.0, 180.0, 75.0, 22.0])
obj("node", f"node.script {M4L / 'launch.js'} @autostart 0 @watch 0", 1, 2, [640.0, 210.0, 330.0, 22.0], ["", ""])
obj("route", "route done error", 3, 3, [640.0, 240.0, 100.0, 22.0], ["", "", ""])
msg("m_stop", "script stop", [640.0, 270.0, 70.0, 22.0])
obj("prep_err", "prepend set Erreur :", 1, 1, [760.0, 270.0, 120.0, 22.0], [""])
wire("b_app", 0, "sel_app", 0)
wire("sel_app", 0, "m_start", 0)
wire("m_start", 0, "node", 0)
wire("node", 0, "route", 0)
wire("route", 0, "m_stop", 0)
wire("m_stop", 0, "node", 0)
wire("route", 1, "prep_err", 0)
wire("prep_err", 0, "l_status", 0)

wire("code", 1, "l_num", 0)
wire("code", 2, "l_name", 0)
wire("code", 3, "l_info", 0)
wire("code", 4, "l_status", 0)

patcher = {
    "patcher": {
        "fileversion": 1,
        "appversion": {"major": 9, "minor": 1, "revision": 5, "architecture": "x64", "modernui": 1},
        "classnamespace": "box",
        "rect": [100.0, 100.0, 900.0, 640.0],
        "openrect": [0.0, 0.0, W, H],
        "bglocked": 0,
        "openinpresentation": 1,
        "default_fontsize": 10.0,
        "default_fontface": 0,
        "default_fontname": "Ableton Sans Medium",
        "gridonopen": 1,
        "gridsize": [8.0, 8.0],
        "gridsnaponopen": 1,
        "objectsnaponopen": 1,
        "statusbarvisible": 0,
        "toolbarvisible": 1,
        "boxanimatetime": 500,
        "enablehscroll": 1,
        "enablevscroll": 1,
        "devicewidth": W,
        "description": "Affiche le preset joué sur un Sequential Trigon-6 ou Prophet-6, avec les noms et protections de l'app Presets Sequential.",
        "digest": "",
        "tags": "",
        "style": "",
        "subpatcher_template": "",
        "assistshowspatchername": 0,
        "boxes": boxes,
        "parameters": {"b_synth": ["Synthé", "Synthé", 0], "parameterbanks": {}},
        "lines": lines,
        "dependency_cache": [],
        "latency": 0,
        "is_mpe": 0,
        "minimum_live_version": "",
        "minimum_max_version": "",
        "platform_compatibility": 0,
        "autosave": 0,
        "title": NAME,
        "project": {
            "version": 1, "creationdate": 3590052786, "modificationdate": 3590052786,
            "viewrect": [0.0, 0.0, 300.0, 500.0], "autoorganize": 1, "hideprojectwindow": 1,
            "showdependencies": 1, "autolocalize": 0, "contents": {"patchers": {}}, "layout": {},
            "searchpath": {}, "detailsvisible": 0, "amxdtype": 1835887981, "readonly": 0,
            "devpathtype": 0, "devpath": ".", "sortmode": 0, "viewmode": 0,
        },
    }
}

data = json.dumps(patcher, ensure_ascii=False, indent=1).encode("utf-8") + b"\n\x00"
header = b"ampf" + struct.pack("<I", 4) + b"mmmm" + b"meta" + struct.pack("<I", 4) + struct.pack("<I", 0)
OUT.parent.mkdir(exist_ok=True)
OUT.write_bytes(header + b"ptch" + struct.pack("<I", len(data)) + data)
print(f"Écrit : {OUT} ({OUT.stat().st_size} octets)")

CFG.max_for_live_dir.mkdir(parents=True, exist_ok=True)
shutil.copy2(OUT, CFG.max_for_live_dir / OUT.name)
print(f"Installé : {CFG.max_for_live_dir / OUT.name}")
