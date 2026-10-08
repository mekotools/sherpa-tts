#!/usr/bin/env python3
"""Baut das Stimmenverzeichnis fuer das Vorlese-Werkzeug.

Laeuft im Bau (Dockerfile, Stufe `stimmen`). Eingang: die heruntergeladenen und
entpackten Modelldateien (je Stimme `<quelle>.onnx`). Ausgang: die Dateien unter
sprechenden Namen mit Pruefsumme sowie `stimmen.json`, das die Oberflaeche laedt.

Warum der Name die Pruefsumme traegt: die Dateien gehen mit einem Jahr
Haltbarkeit ueber die Leitung ("immutable"). Aendert sich eine Stimme, aendert
sich der Name — sonst haetten Browserspeicher und Zwischenspeicher eine alte
Fassung ein Jahr lang festgehalten.

Warum ein fehlendes Modell den Bau abbricht: eine im Katalog angekuendigte
Stimme, die nicht da ist, waere ein Schalter ohne Wirkung — genau der Fehler,
der hier behoben wird.

Aufruf: python3 stimmen_manifest.py <eingang> <ausgang> <katalog.json>
"""
import hashlib
import json
import os
import sys


def pruefsumme(pfad: str) -> str:
    h = hashlib.sha256()
    with open(pfad, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def main() -> int:
    eingang, ausgang, katalogpfad = sys.argv[1], sys.argv[2], sys.argv[3]
    katalog = json.load(open(katalogpfad, encoding="utf-8"))

    fehler: list[str] = []
    stimmen: list[dict] = []
    gesamt = 0

    for eintrag in katalog["stimmen"]:
        quelle = os.path.join(eingang, eintrag["quelle"] + ".onnx")
        if not os.path.isfile(quelle):
            fehler.append(f"Modell fehlt: {quelle}")
            continue
        kennung = eintrag["kennung"]
        summe = pruefsumme(quelle)
        name = f"{kennung}-{summe[:8]}.onnx"
        groesse = os.path.getsize(quelle)
        os.replace(quelle, os.path.join(ausgang, name))
        gesamt += groesse
        stimmen.append(
            {
                "kennung": kennung,
                "datei": name,
                "groesse": groesse,
                "pruefsumme": summe,
                "name": eintrag["name"],
                "beschreibung": eintrag["beschreibung"],
                "abtastrate": eintrag["abtastrate"],
                "stimmungen": eintrag.get("stimmungen", {}),
            }
        )
        print(f"  {kennung:16} {groesse/1048576:6.1f} MB  {name}")

    if fehler:
        print("Der Bau bricht ab:", file=sys.stderr)
        for f in fehler:
            print("  - " + f, file=sys.stderr)
        return 1

    vorgabe = katalog["vorgabe"]
    if vorgabe not in [s["kennung"] for s in stimmen]:
        print(f"Vorgabestimme {vorgabe!r} fehlt im Katalog", file=sys.stderr)
        return 1

    manifest = {
        "fassung": os.environ.get("FASSUNG", "unbekannt"),
        "vorgabe": vorgabe,
        "stimmen": stimmen,
    }
    ziel = os.path.join(ausgang, "stimmen.json")
    with open(ziel, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"  {len(stimmen)} Stimmen, {gesamt/1048576:.1f} MB gesamt -> {ziel}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
