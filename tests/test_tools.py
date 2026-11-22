"""Tests des outils Python : configuration et serveur de développement.

Lancement : make test   (ou python3 -m unittest discover -s tests)
"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "tools"))

import config  # noqa: E402


class ConfigTest(unittest.TestCase):
    def test_valeurs_par_defaut_sans_fichier(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.object(config, "CONFIG_FILE", Path(d) / "absent.json"), \
                mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("SP_DATA_DIR", None)
            c = config.load()
            self.assertEqual(c.data_dir, Path.home() / "Documents/Sequential Librarian")
            self.assertEqual(c.install_dir, Path("/Applications"))

    def test_fichier_et_tilde(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "config.json"
            f.write_text(json.dumps({"dataDir": "~/Données"}))
            with mock.patch.object(config, "CONFIG_FILE", f):
                os.environ.pop("SP_DATA_DIR", None)
                self.assertEqual(config.load().data_dir, Path.home() / "Données")

    def test_variable_d_environnement_prioritaire(self):
        with mock.patch.dict(os.environ, {"SP_DATA_DIR": "/tmp/essai"}):
            self.assertEqual(config.load().data_dir, Path("/tmp/essai"))


class ServeurTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        with mock.patch.dict(os.environ, {"SP_DATA_DIR": cls.tmp.name}):
            import dev_server
        cls.srv = dev_server
        cls.srv.DATA = Path(cls.tmp.name)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_nom_de_sauvegarde_nettoye(self):
        self.assertEqual(self.srv.clean_label("Trigon-6 012 Rip & Pull/../x"), "Trigon-6 012 Rip  Pull..x")
        self.assertEqual(self.srv.clean_label("<<>>"), "sauvegarde")
        self.assertLessEqual(len(self.srv.clean_label("a" * 200)), 80)

    def test_synthe_inconnu_refuse(self):
        with self.assertRaises(ValueError):
            self.srv.synth_dir("../../etc")

    def test_ecriture_atomique(self):
        f = Path(self.tmp.name) / "x.json"
        self.srv.write_atomic(f, b"{}")
        self.assertEqual(f.read_bytes(), b"{}")
        self.assertFalse(f.with_suffix(".json.tmp").exists())


if __name__ == "__main__":
    unittest.main()
