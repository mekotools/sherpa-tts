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
| `Dockerfile` | Vier Stufen: Grunddaten holen, Stimmen holen, WebAssembly bauen, statisch ausliefern |
| `web/index.html`, `web/vorlesen.js` | Deutsche Oberfläche und ihre Ablauflogik |
| `web/service-worker.js` | Zwischenspeicher im Browser (Rechenkern und Stimmen) |
| `web/nginx-vorlesen.conf` | Kopfzeilen für das Zwischenspeichern |
| `stimmen/katalog.json` | Stimmenauswahl mit Beschreibung, Abtastrate und Lizenz |
| `stimmen/stimmen_holen.py`, `stimmen/stimmen_manifest.py` | Stimmen holen, prüfen und benennen (Bauzeit) |
| `patches/` | Angepasste Stellen im fremden Quelltext, mit Ankerprüfung |

## Herkunft und Lizenz

- Sprachsynthese: [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) (next-gen Kaldi,
  **Apache-2.0**), als WebAssembly gebaut.
- Stimmen: vier deutsche Piper-Modelle in der verkleinerten Fassung (`…-int8`) aus
  dem amtlichen Modell-Release `tts-models` — Thorsten (acht Stimmungen), Thorsten
  (höchste Klangtreue), Thorsten (kleinste Datei) und Kerstin. Alle vier stehen
  unter **CC0**; die Lizenzangaben sind in `stimmen/katalog.json` je Stimme
  festgehalten und stammen aus der Model-Card des Sprechers im Verzeichnis
  `rhasspy/piper-voices`.
- **Nicht aufgenommen**, obwohl im Release vorhanden: `eva_k`, `ramona` und
  `karlsson` (Model-Card nennt nur „See URL“ statt einer Lizenz), `pavoque`
  (CC BY-NC-SA 4.0 — nicht gewerblich) und `glados`/`glados_turret` (Spielfigur).
  Weitere Stimmen können aufgenommen werden, sobald die Lizenzfrage geklärt ist —
  der Katalog ist dafür die einzige Stelle, die geändert werden muss.
- Die Oberfläche der Beispielseite wurde ersetzt; angepasst wird nur noch der
  Arbeiter (Web Worker) in `patches/arbeiter-stimme.sh`. Das Skript prüft seine
  Anker und bricht ab, wenn der fremde Quelltext sich ändert.

## Bauen und betreiben

- Gebaut wird **in der CI**, nicht auf dem Zielhost: `.forgejo/workflows/abbild.yml`
  (eigener Läufer auf flip, nur von Hand auslösbar) und `.github/workflows/abbild.yml`
  (Spiegel, der eigentliche Bauweg; legt das Paket in GHCR ab).
- **Einmalig nach dem ersten Bau:** das Paket liegt in GHCR zunächst privat. Die
  Sichtbarkeit lässt sich über die Schnittstelle **nicht** ändern (für Pakete einer
  Organisation gibt es keinen solchen Endpunkt) — also im Web umstellen:
  `https://github.com/orgs/mekotools/packages/container/sherpa-tts/settings`
  → Danger Zone → Change visibility → Public. Danach bleibt es öffentlich.
- Festgenagelte Fassungen: sherpa-onnx `99ddefaa9212`, emscripten `4.0.23`,
  onnxruntime (wasm, simd) `1.28.2`, Auslieferung `nginx:alpine-slim`; die vier
  Stimmen stehen in `stimmen/katalog.json` auf `…-int8` fest.
- Betrieb auf flip als Stapel `/poolio/docker/mekotools-sherpa-tts` mit dem
  digest-genagelten Abbild `ghcr.io/mekotools/sherpa-tts`.
- **Nicht mehr im WebAssembly-Paket:** dort stecken nur noch der Rechenkern und
  die Grunddaten von espeak-ng (rund 17 MB zusammen, vorher 90 MB mit eingebauter
  Stimme). Die Stimme holt die Seite beim Aufruf einzeln und legt sie danach in
  den Zwischenspeicher des Browsers (`web/service-worker.js`). Gemessen vorher:
  **108 MB und 25 s bei jedem Aufruf**; jetzt nur beim ersten Mal.
- Eine andere Stimme ist kein neuer Bau: sie wird über `stimmen/katalog.json`
  aufgenommen, der Bau holt sie und nimmt sie mit ins Verzeichnis.
- Bekannte Auflösung 1280×720 oder größer nicht nötig; das Werkzeug läuft auf
  Desktop und Tablet, ohne Kamera und ohne Mikrofon.

## Grenzen

- Zwei Sprecherinnen und Sprecher in vier Stimmen; die Auswahl ist eine Auswahl,
  keine Ausrede — die Liste nennt zu jeder Stimme Herkunft, Abtastrate, Größe und
  Stimmungen.
- Keine Betonungssteuerung, kein Mikrofon, keine Stimmerkennung.
- Lange Texte dauern (ein Rechenstrang im Browser).
- Erzeugte Audiodateien bleiben im Tab; wer sie behalten will, lädt sie herunter,
  bevor der Tab geschlossen wird.
