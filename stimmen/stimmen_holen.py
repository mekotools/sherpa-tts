#!/usr/bin/env python3
"""Holt die angekuendigten Stimmen aus dem amtlichen Modell-Release.

Laeuft im Bau (Dockerfile, Stufe `stimmen`). Legt je Stimme die Modelldatei als
`<eingang>/<quelle>.onnx` ab — so, wie stimmen_manifest.py sie erwartet.

Warum die int8-Fassungen: die unveraenderten Piper-Modelle sind 63-77 MB gross,
die int8-Fassungen 5-20 MB. Bei einem Werkzeug, das im Klassenzimmer ueber
Schulnetze laedt, ist das der Unterschied zwischen "geht" und "geht nicht".

Aufruf: python3 stimmen_holen.py <katalog.json> <eingang> [<basis-url>]
"""
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request

BASIS = ("https://github.com/k2-fsa/sherpa-onnx/releases/download/"
         "tts-models")
MINDESTGROESSE = 1 << 20  # 1 MB — darunter ist etwas schiefgegangen


def holen(url: str, ziel: str) -> None:
    print(f"    hole {url}", flush=True)
    anfrage = urllib.request.Request(url, headers={"User-Agent": "mekotools-bau"})
    with urllib.request.urlopen(anfrage, timeout=600) as antwort, open(ziel, "wb") as aus:
        shutil.copyfileobj(antwort, aus, 1 << 20)


def main() -> int:
    katalog = json.load(open(sys.argv[1], encoding="utf-8"))
    eingang = sys.argv[2]
    basis = sys.argv[3] if len(sys.argv) > 3 else BASIS
    os.makedirs(eingang, exist_ok=True)

    for eintrag in katalog["stimmen"]:
        # Die Pakete des amtlichen Releases tragen das Kuerzel "vits-piper-"
        # vor dem Modellnamen (geprueft gegen die Asset-Liste des Releases).
        paket = f"vits-piper-{eintrag['quelle']}.tar.bz2"
        with tempfile.TemporaryDirectory() as temp:
            bogen = os.path.join(temp, paket)
            holen(f"{basis}/{paket}", bogen)
            with tarfile.open(bogen, "r:bz2") as tar:
                # Die Pakete entpacken sich in ein Verzeichnis mit dem Modellnamen.
                tar.extractall(temp, filter="data")
            gefunden = []
            for wurzel, _, dateien in os.walk(temp):
                for d in dateien:
                    if d.endswith(".onnx"):
                        gefunden.append(os.path.join(wurzel, d))
            if len(gefunden) != 1:
                print(f"  ABBRUCH: {paket} enthält {len(gefunden)} Modelldateien, erwartet 1",
                      file=sys.stderr)
                return 1
            ziel = os.path.join(eingang, f"{eintrag['quelle']}.onnx")
            shutil.move(gefunden[0], ziel)
            groesse = os.path.getsize(ziel)
            if groesse < MINDESTGROESSE:
                print(f"  ABBRUCH: {ziel} ist nur {groesse} Bytes groß", file=sys.stderr)
                return 1
            print(f"  {eintrag['kennung']:16} {groesse/1048576:6.1f} MB  ({paket})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
