# Vorlesen — Ausführungs-Anleitung

Öffne im Browser **sherpa-tts.mekotools.de**. Keine Anmeldung, keine Installation.
Beim ersten Aufruf lädt die Seite einmalig das Sprachpaket (einige zehn Megabyte);
danach arbeitet sie ohne Netzverbindung weiter, solange der Tab offen bleibt.

## In drei Schritten

1. **Text eingeben.** In das große Feld tippst du den Text, der vorgelesen werden
   soll — ein Satz, ein Absatz, ein Gedicht.
2. **Tempo einstellen** (Voreinstellung 1,0). Mit dem Regler wird es langsamer
   (unter 1,0) oder schneller (über 1,0).
3. **Vorlesen anklicken.** Nach kurzer Rechenzeit erscheint unten ein Abspielgerät.
   Dort steht *Sichern* zum Herunterladen der Audiodatei und *Löschen* zum
   Wegwerfen — beides bezieht sich nur auf die Ablage im Tab.

Mehrere Texte hintereinander erzeugen ist möglich: jeder Durchlauf legt ein
eigenes Abspielgerät an, so lassen sich Fassungen vergleichen.

**Stimm-Nummer:** Diese Angabe erscheint nur, wenn ein Modell mehrere Stimmen
enthält. Unsere Stimme hat genau eine (Nummer 0) — das Feld ist dann ohne Wirkung
und wird nicht angezeigt.

## Dateien und Daten

- Es wird **nichts hochgeladen**. Text und Ton bleiben auf dem Gerät; es gibt
  keinen Server, der sie speichern könnte.
- Die Seite lädt **keine fremden Bestandteile**: keine Werbenetze, keine
  Zähl-Dienste, keine fremden Schriftarten. Alles kommt von unserem Server.
- Beim Schließen des Tabs sind die erzeugten Audiodateien weg, wenn sie nicht
  vorher gesichert wurden.
- Auf geteilten Geräten gilt: die Ablage im Tab sieht die nächste Person mit
  demselben Browserprofil.

## Grenzen

- **Eine Stimme.** Es gibt keine Auswahl zwischen Sprecherinnen und Sprechern.
  Eine weitere Stimme wäre ein neuer Bau des Abbilds, kein Schalter.
- **Betonung ist nicht steuerbar.** Die Stimme liest sachlich vor; Fragen klingen
  nicht automatisch fragend, Aufzählungen werden nicht besonders hervorgehoben.
  Satzzeichen wirken nur als Pausen.
- **Lange Texte dauern.** Die Erzeugung läuft in einem einzigen Rechenstrang auf
  der Hauptrechnung des Browsers. Für ein ganzes Kapitel ist das Werkzeug nicht
  gedacht — dann lieber abschnittsweise vorlesen lassen.
- **Keine Umwandlung von Bildern oder PDFs.** Als Textgrundlage dient nur, was
  eingetippt oder eingefügt wird.
- **Keine Stimmenerkennung, keine Sprechertrennung.** Das Werkzeug erzeugt nur
  Sprache, es erkennt keine.
- Das Werkzeug stammt von einem freien Projekt (Apache-2.0). Wir betreiben einen
  eigenen Bau; Fehler in der Sprachsynthese stammen aus dem Projekt, nicht aus
  unserem Aufbau.

## Herkunft (für die Lehrkraft, die nachfragt)

- Sprachsynthese: sherpa-onnx, Fassung festgenagelt im Werkzeug-Repo.
- Stimme: deutsches Piper-Modell `thorsten_emotional` aus dem amtlichen
  Modell-Release des Projekts. Die **Lizenz der Stimme** ist eine eigene Angabe
  des jeweiligen Modells und wird im Werkzeug-Repo geführt; sie ist nicht
  dieselbe wie die Code-Lizenz.
- Unsere Oberfläche ist die deutsche Übersetzung der mitgelieferten Beispielseite;
  die angefassten Stellen stehen als Skript im Repo und brechen ab, wenn der
  fremde Quelltext sich ändert.
