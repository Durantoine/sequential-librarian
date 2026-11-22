"""Configuration locale de Sequential Librarian.

Les réglages propres à chaque machine (dossiers) sont dans config.json, à la
racine du projet. Ce fichier n'est pas versionné : voir config.example.json.
Toute clé absente prend sa valeur par défaut.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG_FILE = ROOT / "config.json"

DEFAULTS = {
    "dataDir": "~/Documents/Sequential Librarian",
    "installDir": "/Applications",
    "maxForLiveDir": "~/Music/Max for Live",
}


@dataclass(frozen=True)
class Config:
    data_dir: Path        # base, notes Markdown et sauvegardes .syx
    install_dir: Path     # où installer l'application
    max_for_live_dir: Path  # où installer le device Max for Live


def load() -> Config:
    values = dict(DEFAULTS)
    if CONFIG_FILE.exists():
        values.update(json.loads(CONFIG_FILE.read_text("utf-8")))
    if os.environ.get("SP_DATA_DIR"):  # surcharge ponctuelle, pour les tests
        values["dataDir"] = os.environ["SP_DATA_DIR"]
    path = lambda k: Path(values[k]).expanduser()
    return Config(path("dataDir"), path("installDir"), path("maxForLiveDir"))
