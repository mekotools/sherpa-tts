#!/bin/sh
# Eingriff in den Arbeiter (Web Worker) der sherpa-onnx-Beispielseite.
#
# Warum ueberhaupt: die Beispielseite hat die Stimme fest im WebAssembly-Paket.
# Das Werkzeug liefert sie stattdessen einzeln aus — deshalb muss der Arbeiter
# die gewaehlte Stimme holen, in sein Dateisystem schreiben und erst dann den
# Rechenkern starten. Die Oberflaeche (web/vorlesen.js) redet dafuer ueber zwei
# zusaetzliche Nachrichten mit ihm:
#     hin:  {"type":"stimme-laden", "url": …, "name": …}
#     zurueck: {"type":"mekotools-bereit-fuer-stimme"} und
#              {"type":"mekotools-stimme-fortschritt", "geholt": …, "gesamt": …}
#
# Warum als Skript mit Ankerpruefung: aendert das Projekt diese Zeilen, bricht
# der Bau mit klarer Meldung ab. Sonst faende ein stiller Fehlschlag erst im
# Klassenzimmer statt (die Seite bliebe bei "Wird geladen ..." stehen).
#
# Aufruf:  sh arbeiter-stimme.sh <verzeichnis mit sherpa-onnx-tts.worker.js>

set -eu

ORDNER="${1:-.}"
DATEI="$ORDNER/sherpa-onnx-tts.worker.js"

[ -f "$DATEI" ] || { echo "ABBRUCH: $DATEI fehlt"; exit 1; }

# Zaehlen und ersetzen in einem: mehrzeilige Muster lassen sich mit grep nicht
# zuverlaessig zaehlen (grep -c zaehlt Zeilen, nicht Vorkommen — bei einem Muster
# aus 15 Zeilen meldete es "36 mal").
# Aufruf: pruefe_und_ersetze "<alt>" "<neu>" [<erwartete Trefferzahl>]
# Mehr als eine Stelle wird nur ersetzt, wenn die Zahl ausdruecklich angegeben
# ist — sonst waere ein Muster, das mehrfach passt, ein stiller Fehler.
pruefe_und_ersetze() {
  python3 - "$DATEI" "$1" "$2" "${3:-1}" <<'PY'
import sys

pfad, alt, neu = sys.argv[1], sys.argv[2], sys.argv[3]
erwartet = int(sys.argv[4])
text = open(pfad, encoding="utf-8").read()
anzahl = text.count(alt)
if anzahl != erwartet:
    erste = alt.strip().splitlines()[0][:70] if alt.strip() else "(leer)"
    print(f"ABBRUCH: Anker kommt {anzahl} mal vor (erwartet {erwartet}): {erste}")
    print("         Der fremde Quelltext hat sich geaendert.")
    raise SystemExit(1)
open(pfad, "w", encoding="utf-8").write(text.replace(alt, neu))
print(f"  ersetzt ({anzahl} Stellen): " + (alt.strip().splitlines()[0][:60] if alt.strip() else "(leer)") + " …")
PY
}

# 1. Beim Start nicht mehr selbst loslegen: erst muss die Stimme da sein.
pruefe_und_ersetze \
'    console.log("Model files downloaded!");
    console.log("Initializing tts ......");
    try {
      tts = createOfflineTts(self.Module);
      self.postMessage({
        type: "sherpa-onnx-tts-ready",
        modelType: getDefaultOfflineTtsModelType(),
        numSpeakers: tts.numSpeakers,
      });
    } catch (e) {
      self.postMessage({
        type: "error",
        message: "TTS Initialization failed: " + e.message,
      });
    }' \
'    // MekoTools: Die Stimme steckt nicht mehr im WebAssembly-Paket. Der
    // Rechenkern meldet hier nur seine Bereitschaft; die Oberflaeche schickt
    // daraufhin "stimme-laden" mit der gewaehlten Stimme.
    self.postMessage({ type: "mekotools-bereit-fuer-stimme" });'

# 2. Stimme holen, in das Dateisystem schreiben, Rechenkern damit starten.
pruefe_und_ersetze \
'self.onmessage = async (e) => {
  const { type, text, sid, speed, genConfig } = e.data;
  if (type == "generate") {' \
'/** Holt eine Stimme und startet den Rechenkern damit (MekoTools). */
async function stimmeLaden(daten) {
  const antwort = await fetch(daten.url);
  if (!antwort.ok) {
    throw new Error(
      "Die Stimme konnte nicht geladen werden (" +
        antwort.status +
        " " +
        antwort.statusText +
        "): " +
        daten.url,
    );
  }
  const gesamt = Number(antwort.headers.get("Content-Length") || 0);
  const leser = antwort.body.getReader();
  const teile = [];
  let geholt = 0;
  for (;;) {
    const { done, value } = await leser.read();
    if (done) break;
    teile.push(value);
    geholt += value.length;
    self.postMessage({ type: "mekotools-stimme-fortschritt", geholt, gesamt });
  }
  const inhalt = new Uint8Array(geholt);
  let versatz = 0;
  for (const teil of teile) {
    inhalt.set(teil, versatz);
    versatz += teil.length;
  }
  // Der Rechenkern sucht die Stimme unter "model.onnx" in seinem Dateisystem.
  try {
    self.Module.FS_unlink("/model.onnx");
  } catch (fehler) {
    // War noch nicht vorhanden — der Normalfall beim ersten Start.
  }
  self.Module.FS_createDataFile("/", "model.onnx", inhalt, true, true, true);
  tts = createOfflineTts(self.Module);
  self.postMessage({
    type: "sherpa-onnx-tts-ready",
    modelType: getDefaultOfflineTtsModelType(),
    numSpeakers: tts.numSpeakers,
    name: daten.name,
  });
}

self.onmessage = async (e) => {
  const { type, text, sid, speed, genConfig } = e.data;
  if (type == "stimme-laden") {
    try {
      await stimmeLaden(e.data);
    } catch (fehler) {
      self.postMessage({ type: "error", message: getErrorMessage(fehler) });
    }
    return;
  }
  if (type == "generate") {'

# 3. Fortschritt auch beim einfachen Erzeugen melden.
# Der Rueckruf war nur im Zweig "generateWithConfig" gesetzt; die Oberflaeche
# schickt aber "generate". Folge: der Balken blieb bei 0 % stehen und die
# Restzeit erschien nie (am 08.10.2026 auf der lebenden Seite gemessen).
pruefe_und_ersetze \
'      const audio = tts.generate({
        text: text,
        sid: sid || 0,
        speed: speed || 1.0,
      });' \
'      // MekoTools: mit Rueckruf, damit echter Fortschritt gemeldet wird.
      const audio = tts.generateWithConfig(text, {
        sid: sid || 0,
        speed: speed || 1.0,
        callback: (samples, n, progress) => {
          self.postMessage({
            type: "sherpa-onnx-tts-generation-progress",
            progress: progress,
          });
          return 1;
        },
      });'

# 4. Fehlermeldungen auf Deutsch (sie landen sichtbar in der Oberflaeche).
pruefe_und_ersetze '"Generation failed: "' '"Die Erzeugung ist fehlgeschlagen: "' 2

echo "  Arbeiter angepasst: Stimme wird beim Aufruf geladen, Fortschritt gemeldet"
