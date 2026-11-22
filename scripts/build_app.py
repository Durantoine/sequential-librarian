#!/usr/bin/env python3
"""Construit « Sequential Librarian.app » et l'installe (dossier installDir de config.json).

    make app        (ou python3 scripts/build_app.py [--no-install])

Il faut les outils de développement d'Apple (swiftc, iconutil, sips).
"""
from __future__ import annotations

import platform
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import config

APP_NAME = "Sequential Librarian"
EXECUTABLE = "SequentialLibrarian"
ROOT = config.ROOT
BUILD = ROOT / "build"


def run(*cmd: str) -> None:
    subprocess.run(cmd, check=True)


def build_icon(tmp: Path) -> Path:
    src = ROOT / "assets/icon/icon-1024.png"
    iconset = tmp / "AppIcon.iconset"
    iconset.mkdir()
    for s in (16, 32, 128, 256, 512):
        run("sips", "-z", str(s), str(s), str(src), "--out", str(iconset / f"icon_{s}x{s}.png"))
        run("sips", "-z", str(2 * s), str(2 * s), str(src), "--out", str(iconset / f"icon_{s}x{s}@2x.png"))
    out = tmp / "AppIcon.icns"
    run("iconutil", "-c", "icns", str(iconset), "-o", str(out))
    return out


def build() -> Path:
    app = BUILD / f"{APP_NAME}.app"
    shutil.rmtree(app, ignore_errors=True)
    contents = app / "Contents"
    (contents / "MacOS").mkdir(parents=True)
    (contents / "Resources").mkdir()
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        run("swiftc", "-O", str(ROOT / "macos/main.swift"),
            "-framework", "Cocoa", "-framework", "WebKit", "-framework", "CoreMIDI",
            "-target", f"{platform.machine()}-apple-macos12", "-o", str(contents / "MacOS" / EXECUTABLE))
        shutil.copy2(build_icon(tmp), contents / "Resources/AppIcon.icns")
    shutil.copytree(ROOT / "web", contents / "Resources/web")   # copie de secours de l'interface
    version = (ROOT / "VERSION").read_text().strip()
    plist = (ROOT / "macos/Info.plist").read_text()
    plist = plist.replace("@VERSION@", version).replace("@PROJECT_DIR@", str(ROOT))
    (contents / "Info.plist").write_text(plist)
    subprocess.run(["codesign", "--force", "--sign", "-", str(app)], check=False, capture_output=True)
    return app


def install(app: Path) -> Path:
    dest = config.load().install_dir / app.name
    shutil.rmtree(dest, ignore_errors=True)
    shutil.copytree(app, dest, symlinks=True)
    dest.touch()
    return dest


if __name__ == "__main__":
    built = build()
    print(f"Construite : {built}")
    if "--no-install" not in sys.argv:
        print(f"Installée : {install(built)}")
