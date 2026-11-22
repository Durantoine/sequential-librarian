# Sequential Librarian : commandes de développement.
# Réglages locaux (dossiers) : config.json, voir config.example.json.

PYTHON ?= python3

.PHONY: help app device test check serve clean

help:
	@echo "make app      construit et installe l'application Mac"
	@echo "make device   construit et installe le device Max for Live"
	@echo "make test     lance les tests"
	@echo "make check    vérifie la syntaxe (JavaScript, Python, Swift)"
	@echo "make serve    ouvre l'interface dans Chrome (développement)"
	@echo "make clean    supprime build/"

app:
	$(PYTHON) scripts/build_app.py

device:
	$(PYTHON) scripts/build_device.py

test:
	node --test tests/*.test.mjs
	$(PYTHON) -m unittest discover -s tests -p "test_*.py" -q

check:
	@for f in web/js/*.js m4l/*.js; do node --check "$$f" || exit 1; done
	$(PYTHON) -m py_compile scripts/*.py tools/*.py
	swiftc -typecheck macos/main.swift
	@echo "Syntaxe OK"

serve:
	$(PYTHON) tools/dev_server.py

clean:
	rm -rf build
