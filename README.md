# MekoTools: Vorlesen

Text zu Sprache im Browser. Die Lehrkraft (oder die Lernenden) tippen einen Text
ein, drücken *Vorlesen* und hören das Ergebnis sofort — auf dem eigenen Gerät,
ohne Anmeldung, ohne Upload. Selbst betrieben unter <https://sherpa-tts.mekotools.de>.

| Datei | Zweck |
|---|---|
| `tool.yaml` | Metadaten (Schema: `schema/tool.schema.json` im Katalog-Repo) |
| `docs/anleitung.md` | Schritt für Schritt: Text vorlesen lassen |
| `docs/didaktik.md` | Was sich damit lehren lässt, für wen, welche Grenzen |
| `docs/unterrichtsentwurf.md` | Fertiger Entwurf für 45 Minuten |
| `Dockerfile` | Drei Stufen: Stimme holen, WebAssembly bauen, statisch ausliefern |
| `web/index.html` | Deutsche Oberfläche (die Beispielseite des Projekts, übersetzt) |
| `patches/` | Angepasste Stellen im fremden Quelltext, mit Ankerprüfung |

## Herkunft und Lizenz

- Sprachsynthese: [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) (next-gen Kaldi,
  **Apache-2.0**), als WebAssembly gebaut.
- Stimme: `vits-piper-de_DE-thorsten_emotional-medium` aus dem amtlichen
  Modell-Release `tts-models`. Piper-Stimmen sind eigene Werke mit eigener Lizenz —
  die Lizenz der Stimme ist **je Modell** zu prüfen (siehe `docs/anleitung.md`,
  Abschnitt „Herkunft“).
- Die Beispielseite des Projekts wurde für die deutsche Oberfläche angepasst;
  die Eingriffe stehen in `patches/app-tts-beschriftungen.sh` und brechen ab,
  wenn der fremde Quelltext sich ändert.

## Bauen und betreiben

- Gebaut wird **in der CI**, nicht auf dem Zielhost: `.forgejo/workflows/abbild.yml`
  (eigener Läufer auf flip) und `.github/workflows/abbild.yml` (Spiegel; legt das
  Paket in GHCR an und macht es damit öffentlich ziehbar).
- Festgenagelte Fassungen: sherpa-onnx `99ddefaa9212`, emscripten `4.0.23`,
  onnxruntime (wasm, simd) `1.28.2`, Stimme `vits-piper-de_DE-thorsten_emotional-medium`,
  Auslieferung `nginx:alpine-slim`.
- Betrieb auf flip als Stapel `/poolio/docker/mekotools-sherpa-tts` mit dem
  digest-genagelten Abbild `ghcr.io/mekotools/sherpa-tts`.
- Die Stimme steckt **im WebAssembly-Paket**: eine andere Stimme ist ein neuer Bau.
- Bekannte Auflösung 1280×720 oder größer nicht nötig; das Werkzeug läuft auf
  Desktop und Tablet, ohne Kamera und ohne Mikrofon.

## Grenzen

- Eine Stimme, keine Auswahl.
- Keine Betonungssteuerung, kein Mikrofon, keine Stimmerkennung.
- Lange Texte dauern (ein Rechenstrang im Browser).
- Erzeugte Audiodateien bleiben im Tab; wer sie behalten will, lädt sie herunter,
  bevor der Tab geschlossen wird.
