#!/usr/bin/env python3
"""Prüft die eingecheckte Stimmenliste gegen den Katalog.

Warum das nötig ist: die Liste wurde früher im Bau aus den tatsächlich geholten
Dateien erzeugt. Seit die Stimmen nicht mehr mitgebaut werden (sie sind 89 MB und
werden vom VPS ausgeliefert), ist sie eingecheckt — und damit prüfbar. Ohne diese
Prüfung könnte der Katalog eine Stimme ankündigen, die in der Liste fehlt, und
niemand merkte es, bis ein Kind darauf klickt.

Aufruf: python3 stimmen_katalog_pruefen.py <stimmen.json> <katalog.json>
"""
import json
import sys

liste = json.load(open(sys.argv[1], encoding="utf-8"))
katalog = json.load(open(sys.argv[2], encoding="utf-8"))

fehler = []
soll = {e["kennung"] for e in katalog["stimmen"]}
ist = {e["kennung"] for e in liste["stimmen"]}
for fehlt in sorted(soll - ist):
    fehler.append(f"im Katalog angekündigt, in der Liste nicht vorhanden: {fehlt}")
for ueber in sorted(ist - soll):
    fehler.append(f"in der Liste, aber nicht im Katalog: {ueber}")

if liste.get("vorgabe") not in ist:
    fehler.append(f"Vorgabe '{liste.get('vorgabe')}' steht nicht in der Liste")

for eintrag in liste["stimmen"]:
    name = eintrag["datei"]
    summe = eintrag["pruefsumme"]
    if not name.endswith(".onnx"):
        fehler.append(f"{name}: keine .onnx-Datei")
        continue
    # Der Dateiname führt die ersten acht Zeichen der Prüfsumme mit. Stimmt das
    # nicht, passt die Liste nicht zu sich selbst.
    kurz = name[:-len(".onnx")].rsplit("-", 1)[-1]
    if not summe.startswith(kurz):
        fehler.append(f"{name}: Namenskürzel passt nicht zur Prüfsumme")
    if eintrag["groesse"] < (1 << 20):
        fehler.append(f"{name}: nur {eintrag['groesse']} Bytes groß")

if fehler:
    print("ABBRUCH: Stimmenliste und Katalog passen nicht zusammen:")
    for f in fehler:
        print("   " + f)
    raise SystemExit(1)
print(f"Stimmenliste geprüft: {len(liste['stimmen'])} Stimmen, "
      f"{sum(s['groesse'] for s in liste['stimmen']) / 1048576:.1f} MB")
