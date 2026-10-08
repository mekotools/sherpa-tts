# Vorlesen — Ausführungs-Anleitung

Öffne im Browser **sherpa-tts.mekotools.de**. Keine Anmeldung, keine Installation.
Beim ersten Aufruf lädt die Seite einmalig den Rechenkern (rund 17 MB) und die
gewählte Stimme (18 bis 36 MB). Beides bleibt danach im Browserspeicher: auch
beim nächsten Besuch, auch nach dem Schließen des Tabs — **ein zweiter Aufruf
lädt nichts nach**. Eine andere Stimme zu wählen ist der einzige Grund für einen
weiteren Download (und auch den nur einmal).

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

**Stimme und Stimmung.** Oben wählst du die Stimme. Unter der Liste steht zu
jeder, woher sie kommt, wie fein sie aufgenommen ist und wie groß der einmalige
Download ist:

- *Thorsten — acht Stimmungen:* dieselbe Stimme mit auswählbaren Stimmungen
  (amüsiert, wütend, angewidert, betrunken, neutral, schläfrig, überrascht,
  flüsternd). Erscheint die Liste *Stimmung*, wirkt die Auswahl auf die ganze
  Vorlesung.
- *Thorsten — höchste Klangtreue:* die deutlichste, aber größte Fassung.
- *Thorsten — kleinste Datei:* für langsame Verbindungen und ältere Geräte.
- *Kerstin:* eine Frauenstimme.

Während des Ladens zeigt die Seite den Fortschritt in Prozent und Megabyte an —
echte Zahlen aus der laufenden Übertragung. Ist die Stimme schon im Speicher,
steht das dort ausdrücklich („es wird nichts erneut geladen").

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

- **Zwei Sprecherinnen und Sprecher**, vier Stimmen. Andere deutsche Stimmen des
  Projekts sind bewusst nicht dabei: ihre Lizenz ist unklar oder schließt eine
  nicht gewerbliche Nutzung aus (siehe `stimmen/katalog.json`).
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
- Stimmen: vier deutsche Piper-Modelle aus dem amtlichen Modell-Release des
  Projekts. Alle vier stehen unter **CC0 1.0** (keine Bedingungen); die genaue
  Herkunft je Stimme steht in `stimmen/katalog.json`. Die **Lizenz der Stimme**
  ist eine eigene Angabe des jeweiligen Modells und nicht dieselbe wie die
  Code-Lizenz — deshalb wird sie je Stimme geführt.
- Unsere Oberfläche ist die deutsche Übersetzung der mitgelieferten Beispielseite;
  die angefassten Stellen stehen als Skript im Repo und brechen ab, wenn der
  fremde Quelltext sich ändert.
