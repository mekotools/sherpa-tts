#!/bin/sh
# Deutsche Beschriftungen in der Beispiel-Oberflaeche von sherpa-onnx.
#
# Warum als Skript: das Uebersetzen fremden Quelltextes ist ein Eingriff, der
# eine Ankerpruefung braucht. Aendert das Projekt die Zeilen, bricht der Bau
# hier mit klarer Meldung ab, statt stumm eine englische Oberflaeche
# auszuliefern.
#
# Aufruf:  sh app-tts-beschriftungen.sh <verzeichnis mit app-tts.js>

set -eu

ORDNER="${1:-.}"
DATEI="$ORDNER/app-tts.js"

[ -f "$DATEI" ] || { echo "ABBRUCH: $DATEI fehlt"; exit 1; }

pruefe_und_ersetze() {
  ALT="$1"
  NEU="$2"
  if grep -qF "$ALT" "$DATEI"; then
    # Nur die erste Fundstelle ersetzen, Zaehlung pruefen.
    ANZAHL=$(grep -cF "$ALT" "$DATEI")
    [ "$ANZAHL" -eq 1 ] || { echo "ABBRUCH: '$ALT' kommt $ANZAHL mal vor, erwartet genau 1"; exit 1; }
    python3 - "$DATEI" "$ALT" "$NEU" <<'PY'
import sys
p, alt, neu = sys.argv[1], sys.argv[2], sys.argv[3]
t = open(p, encoding="utf-8").read()
assert t.count(alt) == 1, "unerwartete Trefferzahl"
open(p, "w", encoding="utf-8").write(t.replace(alt, neu))
PY
    echo "  ersetzt: $ALT  ->  $NEU"
  else
    echo "ABBRUCH: Anker '$ALT' nicht gefunden — der fremde Quelltext hat sich geaendert"
    echo "         (Englische Reste waeren sonst in der Oberflaeche sichtbar.)"
    exit 1
  fi
}

pruefe_und_ersetze 'speakerIdLabel.innerHTML = `Speaker ID (0 - ' 'speakerIdLabel.innerHTML = `Stimm-Nummer (0 - '
pruefe_und_ersetze "saveButton.textContent = 'Save';" "saveButton.textContent = 'Sichern';"
pruefe_und_ersetze "deleteButton.textContent = 'Delete';" "deleteButton.textContent = 'Loeschen';"

# Gegenprobe: keine englischen Reste uebrig
if grep -qE "Speaker ID|'Save'|'Delete'" "$DATEI"; then
  echo "ABBRUCH: englische Reste uebrig geblieben"
  grep -nE "Speaker ID|'Save'|'Delete'" "$DATEI" | sed 's/^/    /'
  exit 1
fi

echo "  Beschriftungen angepasst, keine englischen Reste in app-tts.js"
