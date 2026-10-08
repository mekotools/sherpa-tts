/* Vorlesen — Ablauf der Oberfläche (MekoTools).
 *
 * Der Rechenkern (WebAssembly) liegt im Abbild; die Stimme nicht. Sie wird
 * hier einzeln geholt, in das Dateisystem des Rechenkerns geschrieben und
 * danach gestartet. Der Service Worker legt sie in den Zwischenspeicher des
 * Browsers — ein zweiter Aufruf lädt nichts nach (siehe service-worker.js).
 *
 * Aufbau: ein Arbeiter (Web Worker) rechnet; diese Datei redet mit ihm und
 * zeigt den Zustand an. Fehler werden sichtbar angezeigt, nie nur im
 * Browser-Protokoll.
 */
"use strict";

const ELEMENTE = {
  stimme: document.getElementById("stimme"),
  stimmenBeschreibung: document.getElementById("stimmenBeschreibung"),
  stimmungZeile: document.getElementById("stimmungZeile"),
  stimmung: document.getElementById("stimmung"),
  tempo: document.getElementById("speed"),
  tempoWert: document.getElementById("speedValue"),
  text: document.getElementById("text"),
  vorlesen: document.getElementById("generateBtn"),
  status: document.getElementById("status"),
  balken: document.getElementById("balken"),
  fuellung: document.getElementById("balkenFuellung"),
  erzeugung: document.getElementById("generationStatus"),
  fehler: document.getElementById("fehler"),
  klippe: document.getElementById("sound-clips"),
};

let ablauf = null; // der laufende Arbeiter
let stimmkatalog = null; // Inhalt von stimmen.json
let geladeneKennung = null; // welche Stimme steckt im Rechenkern
let clipZaehler = 0;
let audioKontext = null;

/* ---------------------------------------------------------------- Anzeigen */

function status(text) {
  ELEMENTE.status.textContent = text;
  ELEMENTE.status.style.display = text ? "block" : "none";
}

function fortschritt(anteil) {
  if (anteil === null) {
    ELEMENTE.balken.style.display = "none";
    ELEMENTE.fuellung.style.width = "0";
    return;
  }
  ELEMENTE.balken.style.display = "block";
  ELEMENTE.fuellung.style.width = Math.max(0, Math.min(100, anteil * 100)) + "%";
}

function zeigeFehler(text) {
  ELEMENTE.fehler.textContent = text;
  ELEMENTE.fehler.style.display = text ? "block" : "none";
}

function erzeugungsStatus(text) {
  ELEMENTE.erzeugung.textContent = text || "";
  ELEMENTE.erzeugung.style.display = text ? "block" : "none";
}

function mb(bytes) {
  return (bytes / 1048576).toFixed(1).replace(".", ",") + " MB";
}

/* --------------------------------------------------------------- Arbeiter */

function arbeiterStarten() {
  if (ablauf) {
    // Ein neuer Arbeiter je Stimme: der alte gibt seinen Speicher vollständig
    // frei. Ein Modell ist bis zu 20 MB groß, zwei gleichzeitig wären auf
    // schwachen Geräten zu viel.
    ablauf.terminate();
    ablauf = null;
  }
  const arbeiter = new Worker("sherpa-onnx-tts.worker.js");
  arbeiter.onmessage = (ereignis) => {
    const daten = ereignis.data || {};
    switch (daten.type) {
      case "sherpa-onnx-tts-progress":
        status(daten.status || "");
        break;
      case "mekotools-bereit-fuer-stimme":
        // Der Rechenkern ist gestartet; jetzt fehlt nur noch die Stimme.
        stimmeHolen();
        break;
      case "mekotools-stimme-fortschritt": {
        const anteil = daten.gesamt ? daten.geholt / daten.gesamt : null;
        fortschritt(anteil);
        status(
          "Stimme wird einmalig geladen: " +
            (anteil === null ? "" : Math.round(anteil * 100) + " % ") +
            "(" + mb(daten.geholt) + (daten.gesamt ? " von " + mb(daten.gesamt) : "") + ")",
        );
        break;
      }
      case "sherpa-onnx-tts-ready":
        geladeneKennung = daten.name || null;
        fortschritt(null);
        status("");
        ELEMENTE.vorlesen.disabled = false;
        stimmungAnzeigen();
        break;
      case "sherpa-onnx-tts-generation-progress": {
        const anteil = typeof daten.progress === "number" ? daten.progress : null;
        fortschritt(anteil);
        erzeugungsStatus(
          "Wird erzeugt …" + (anteil === null ? "" : " " + Math.round(anteil * 100) + " %"),
        );
        break;
      }
      case "sherpa-onnx-tts-result":
        erzeugungsStatus("");
        fortschritt(null);
        ELEMENTE.vorlesen.disabled = false;
        abspielen(daten);
        clipAnlegen(daten);
        break;
      case "error":
        ELEMENTE.vorlesen.disabled = false;
        fortschritt(null);
        zeigeFehler("Es ist ein Fehler aufgetreten:\n" + (daten.message || "ohne Angabe"));
        break;
      default:
        break;
    }
  };
  arbeiter.onerror = (ereignis) => {
    fortschritt(null);
    zeigeFehler(
      "Der Rechenkern konnte nicht gestartet werden:\n" +
        (ereignis.message || "ohne Angabe"),
    );
  };
  ablauf = arbeiter;
}

/* ----------------------------------------------------------------- Stimmen */

function aktuelleStimme() {
  if (!stimmkatalog) return null;
  return stimmkatalog.stimmen.find((s) => s.kennung === ELEMENTE.stimme.value) || null;
}

function stimmeBeschreiben() {
  const s = aktuelleStimme();
  if (!s) {
    ELEMENTE.stimmenBeschreibung.textContent = "";
    return;
  }
  const stimmungen = Object.keys(s.stimmungen || {}).length;
  ELEMENTE.stimmenBeschreibung.textContent =
    s.beschreibung +
    " Download " + mb(s.groesse) + "." +
    (stimmungen > 1
      ? " " + stimmungen + " Stimmungen stehen zur Wahl."
      : "");
}

function stimmungAnzeigen() {
  const s = aktuelleStimme();
  const eintraege = s && s.stimmungen ? Object.entries(s.stimmungen) : [];
  if (eintraege.length < 2) {
    ELEMENTE.stimmungZeile.style.display = "none";
    return;
  }
  ELEMENTE.stimmungZeile.style.display = "block";
  // Nur einmal füllen; die Reihenfolge ist die der Stimmungsnummern.
  if (ELEMENTE.stimmung.dataset.gefuellt !== s.kennung) {
    ELEMENTE.stimmung.innerHTML = "";
    for (const [nummer, bezeichnung] of eintraege.sort((a, b) => Number(a[0]) - Number(b[0]))) {
      const option = document.createElement("option");
      option.value = nummer;
      option.textContent = bezeichnung;
      ELEMENTE.stimmung.appendChild(option);
    }
    ELEMENTE.stimmung.dataset.gefuellt = s.kennung;
  }
}

async function stimmeHolen() {
  const s = aktuelleStimme();
  if (!s || !ablauf) return;
  ELEMENTE.vorlesen.disabled = true;
  const adresse = "stimmen/" + s.datei;

  // Liegt sie schon im Zwischenspeicher, wird nichts geholt — das sagen wir
  // auch so, statt einen Fortschrittsbalken vorzutäuschen.
  let imSpeicher = false;
  if ("caches" in window) {
    try {
      imSpeicher = !!(await caches.match(adresse, { ignoreSearch: true }));
    } catch (fehler) {
      imSpeicher = false;
    }
  }
  if (imSpeicher) {
    status("Stimme liegt im Browserspeicher — es wird nichts erneut geladen.");
  } else {
    status("Stimme wird geholt …");
  }
  fortschritt(imSpeicher ? null : 0);
  ablauf.postMessage({ type: "stimme-laden", url: adresse, name: s.kennung });
}

async function stimmkatalogLaden() {
  try {
    const antwort = await fetch("stimmen/stimmen.json");
    if (!antwort.ok) throw new Error(antwort.status + " " + antwort.statusText);
    stimmkatalog = await antwort.json();
  } catch (fehler) {
    zeigeFehler("Die Stimmenliste konnte nicht geladen werden:\n" + fehler.message);
    status("");
    return;
  }
  ELEMENTE.stimme.innerHTML = "";
  for (const s of stimmkatalog.stimmen) {
    const option = document.createElement("option");
    option.value = s.kennung;
    option.textContent = s.name + " — " + mb(s.groesse);
    ELEMENTE.stimme.appendChild(option);
  }
  // Zuletzt gewählte Stimme merken; sonst die Vorgabe.
  let gewaehlt = stimmkatalog.vorgabe;
  try {
    const gemerkt = localStorage.getItem("mekotools-stimme");
    if (gemerkt && stimmkatalog.stimmen.some((s) => s.kennung === gemerkt)) {
      gewaehlt = gemerkt;
    }
  } catch (fehler) {
    /* Kein Zugriff auf den Speicher — dann eben die Vorgabe. */
  }
  ELEMENTE.stimme.value = gewaehlt;
  ELEMENTE.stimme.disabled = false;
  stimmeBeschreiben();
  stimmungAnzeigen();
  arbeiterStarten();
}

/* --------------------------------------------------------------- Ausgabe */

function abspielen(daten) {
  const proben = daten.samples;
  const rate = daten.sampleRate;
  if (!audioKontext) {
    audioKontext = new AudioContext({ sampleRate: rate });
  }
  const puffer = audioKontext.createBuffer(1, proben.length, rate);
  puffer.getChannelData(0).set(proben);
  const quelle = audioKontext.createBufferSource();
  quelle.buffer = puffer;
  quelle.connect(audioKontext.destination);
  quelle.start();
}

function wavBauen(proben, rate) {
  const werte = new Int16Array(proben.length);
  for (let i = 0; i < proben.length; ++i) {
    let s = proben[i];
    if (s >= 1) s = 1;
    else if (s <= -1) s = -1;
    werte[i] = s * 32767;
  }
  const puffer = new ArrayBuffer(44 + werte.length * 2);
  const sicht = new DataView(puffer);
  const schreibeText = (versatz, text) => {
    for (let i = 0; i < text.length; ++i) sicht.setUint8(versatz + i, text.charCodeAt(i));
  };
  schreibeText(0, "RIFF");
  sicht.setUint32(4, 36 + werte.length * 2, true);
  schreibeText(8, "WAVE");
  schreibeText(12, "fmt ");
  sicht.setUint32(16, 16, true);
  sicht.setUint16(20, 1, true);
  sicht.setUint16(22, 1, true);
  sicht.setUint32(24, rate, true);
  sicht.setUint32(28, rate * 2, true);
  sicht.setUint16(32, 2, true);
  sicht.setUint16(34, 16, true);
  schreibeText(36, "data");
  sicht.setUint32(40, werte.length * 2, true);
  let versatz = 44;
  for (let i = 0; i < werte.length; ++i, versatz += 2) sicht.setInt16(versatz, werte[i], true);
  return new Blob([sicht], { type: "audio/wav" });
}

function nameSaeubern(text) {
  return text.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 60);
}

function clipAnlegen(daten) {
  const weile = wavBauen(daten.samples, daten.sampleRate);
  const anfang = ELEMENTE.text.value.trim().substring(0, 80);
  const beschriftung = ++clipZaehler + ". " + (anfang || "Vorlesung");
  const dateiname = nameSaeubern(beschriftung) + ".wav";

  const karte = document.createElement("div");
  karte.className = "clip";
  const kopf = document.createElement("p");
  kopf.textContent = beschriftung;
  const ton = document.createElement("audio");
  ton.controls = true;
  ton.src = URL.createObjectURL(weile);
  const sichern = document.createElement("button");
  sichern.textContent = "Sichern";
  sichern.className = "zweit";
  sichern.onclick = () => {
    const adresse = URL.createObjectURL(weile);
    const verweis = document.createElement("a");
    verweis.href = adresse;
    verweis.download = dateiname;
    document.body.appendChild(verweis);
    verweis.click();
    document.body.removeChild(verweis);
    URL.revokeObjectURL(adresse);
  };
  const loeschen = document.createElement("button");
  loeschen.textContent = "Löschen";
  loeschen.className = "zweit";
  loeschen.onclick = () => {
    URL.revokeObjectURL(ton.src);
    karte.remove();
  };
  karte.append(kopf, ton, sichern, loeschen);
  ELEMENTE.klippe.prepend(karte);
}

/* ------------------------------------------------------------------ Start */

ELEMENTE.tempo.oninput = () => {
  ELEMENTE.tempoWert.textContent = ELEMENTE.tempo.value;
};

ELEMENTE.stimme.onchange = () => {
  const s = aktuelleStimme();
  if (!s) return;
  try {
    localStorage.setItem("mekotools-stimme", s.kennung);
  } catch (fehler) {
    /* nicht schlimm */
  }
  stimmeBeschreiben();
  stimmungAnzeigen();
  zeigeFehler("");
  if (s.kennung !== geladeneKennung) {
    arbeiterStarten(); // lädt die neue Stimme und startet neu
  }
};

ELEMENTE.vorlesen.onclick = () => {
  const text = ELEMENTE.text.value.trim();
  if (!text) {
    zeigeFehler("Bitte zuerst einen Text eingeben.");
    return;
  }
  zeigeFehler("");
  ELEMENTE.vorlesen.disabled = true;
  erzeugungsStatus("Wird erzeugt …");
  fortschritt(0);
  const stimmung = ELEMENTE.stimmungZeile.style.display === "none"
    ? 0
    : parseInt(ELEMENTE.stimmung.value, 10) || 0;
  ablauf.postMessage({
    type: "generate",
    text,
    sid: stimmung,
    speed: parseFloat(ELEMENTE.tempo.value) || 1.0,
  });
};

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js").catch((fehler) => {
    // Ohne Service Worker funktioniert alles weiter, nur ohne Zwischenspeicher.
    console.warn("Zwischenspeicher nicht verfügbar:", fehler);
  });
}

stimmkatalogLaden();
