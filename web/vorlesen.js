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
  balken: document.getElementById("balken"), // Erzeugung (unter dem Knopf)
  fuellung: document.getElementById("balkenFuellung"),
  stimmenBalken: document.getElementById("stimmenBalken"), // Stimme laden
  stimmenFuellung: document.getElementById("stimmenFuellung"),
  erzeugung: document.getElementById("generationStatus"),
  fehler: document.getElementById("fehler"),
  klippe: document.getElementById("sound-clips"),
};

let ablauf = null; // der laufende Arbeiter
let stimmkatalog = null; // Inhalt von stimmen.json
let geladeneKennung = null; // welche Stimme steckt im Rechenkern
let clipZaehler = 0;
let spieler = []; // alle Abspieler der Seite — es soll immer nur einer laufen
let erzeugungStart = 0; // Beginn der Erzeugung (für die Restzeit)
let erzeugungAnteil = null;
let erzeugungUhr = null;
let stimmeStart = 0; // Beginn des Stimmenladens (für die Restzeit)

/* ---------------------------------------------------------------- Anzeigen */

function status(text) {
  ELEMENTE.status.textContent = text;
  ELEMENTE.status.style.display = text ? "block" : "none";
}

/* Fortschritt zeigen. ziel: "erzeugung" (unter dem Knopf, Vorgabe) oder
 * "stimme" (am Stimmenfeld). Der Balken zeigt immer nur einen gemeldeten,
 * echten Wert — nie eine Schätzung. Die Restzeit steht daneben im Text. */
function fortschritt(anteil, ziel) {
  const balken = ziel === "stimme" ? ELEMENTE.stimmenBalken : ELEMENTE.balken;
  const fuellung = ziel === "stimme" ? ELEMENTE.stimmenFuellung : ELEMENTE.fuellung;
  if (anteil === null) {
    balken.style.display = "none";
    fuellung.style.width = "0";
    return;
  }
  balken.style.display = "block";
  fuellung.style.width = Math.max(0, Math.min(100, anteil * 100)) + "%";
}

/* Restzeit aus echtem Fortschritt: vergangene Zeit geteilt durch den Anteil
 * ergibt die Gesamtdauer; abzüglich der vergangenen Zeit bleibt die Restzeit.
 * Sie wird als Schätzung ausgewiesen ("noch etwa"), nicht als Zusage. */
function restzeit(anteil, gestartet) {
  if (!gestartet || !(anteil > 0.02)) return "";
  const vergangen = (performance.now() - gestartet) / 1000;
  const rest = vergangen / anteil - vergangen;
  if (!Number.isFinite(rest) || rest <= 0) return "";
  if (rest < 1) return "unter einer Sekunde";
  if (rest < 60) return Math.round(rest) + " s";
  const minuten = Math.floor(rest / 60);
  return minuten + " min " + Math.round(rest - minuten * 60) + " s";
}

function erzeugungAnzeigen() {
  if (erzeugungAnteil === null) {
    erzeugungsStatus("Wird erzeugt …");
    return;
  }
  const prozent = Math.round(erzeugungAnteil * 100);
  const rest = restzeit(erzeugungAnteil, erzeugungStart);
  erzeugungsStatus("Wird erzeugt … " + prozent + " %" + (rest ? " — noch etwa " + rest : ""));
}

/* Die Uhr aktualisiert nur den Text zwischen zwei echten Meldungen — der Balken
 * springt weiterhin ausschließlich auf gemeldete Werte. */
function erzeugungUhrStarten() {
  erzeugungUhrStoppen();
  erzeugungUhr = setInterval(erzeugungAnzeigen, 500);
}

function erzeugungUhrStoppen() {
  if (erzeugungUhr) {
    clearInterval(erzeugungUhr);
    erzeugungUhr = null;
  }
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
        fortschritt(anteil, "stimme");
        const rest = restzeit(anteil, stimmeStart);
        status(
          "Stimme wird einmalig geladen: " +
            (anteil === null ? "" : Math.round(anteil * 100) + " % ") +
            "(" + mb(daten.geholt) + (daten.gesamt ? " von " + mb(daten.gesamt) : "") + ")" +
            (rest ? " — noch etwa " + rest : ""),
        );
        break;
      }
      case "sherpa-onnx-tts-ready":
        geladeneKennung = daten.name || null;
        fortschritt(null, "stimme");
        status("");
        ELEMENTE.vorlesen.disabled = false;
        stimmungAnzeigen();
        break;
      case "sherpa-onnx-tts-generation-progress": {
        // Echter Fortschritt aus dem Rechenkern (0 bis 1).
        erzeugungAnteil = typeof daten.progress === "number" ? daten.progress : null;
        fortschritt(erzeugungAnteil);
        erzeugungAnzeigen();
        break;
      }
      case "sherpa-onnx-tts-result":
        erzeugungUhrStoppen();
        erzeugungsStatus("");
        fortschritt(null);
        ELEMENTE.vorlesen.disabled = false;
        clipAnlegen(daten); // spielt gleich los, siehe dort
        break;
      case "error":
        erzeugungUhrStoppen();
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
    stimmeStart = performance.now();
  }
  fortschritt(imSpeicher ? null : 0, "stimme");
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
  // Erst starten, wenn der Zwischenspeicher arbeitet. Sonst holt der Arbeiter
  // die Stimme an ihm vorbei, und der naechste Besuch laedt sie erneut
  // (gemessen am 08.10.2026: 21,99 MB beim zweiten Besuch).
  if ("serviceWorker" in navigator) {
    try {
      // Nicht endlos warten: wird der Zwischenspeicher nicht rechtzeitig fertig,
      // geht es ohne ihn weiter. Eine haengende Seite waere der schlimmere Fehler.
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((fertig) => setTimeout(fertig, 10000)),
      ]);
    } catch (fehler) {
      // Ohne Zwischenspeicher laeuft alles weiter, nur ohne Zwischenspeicher.
    }
  }
  arbeiterStarten();
}

/* --------------------------------------------------------------- Ausgabe */

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

/* Ein Abspieler je Vorlesung: flacher Streifen statt der eingebauten
 * Abspielleiste (die ist rund 54 px hoch, hier sind es rund 18 px).
 *
 * Es läuft immer nur eine Vorlesung. Beim Start hält alleAnhalten() alle
 * anderen an — die eingebaute Leiste konnte das nicht, weil jeder Abspieler
 * für sich stand.
 *
 * Nach dem Erzeugen wird gleich abgespielt, wenn das Gerät es zulässt (die
 * Person hat "Vorlesen" geklickt). Verlangt es einen Klick, sagt das der Titel
 * der Karte — es bleibt nie still und unerklärt.
 */
function alleAnhalten(ausser) {
  for (const s of spieler) {
    if (s !== ausser) s.pause();
  }
}

function uhr(sekunden) {
  if (!Number.isFinite(sekunden) || sekunden < 0) return "0:00";
  const ganz = Math.floor(sekunden);
  return Math.floor(ganz / 60) + ":" + String(ganz % 60).padStart(2, "0");
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
  ton.src = URL.createObjectURL(weile);
  ton.preload = "metadata";

  const streifen = document.createElement("div");
  streifen.className = "abspieler";

  const knopf = document.createElement("button");
  knopf.type = "button";
  knopf.className = "knopf-play";
  knopf.textContent = "▶";
  knopf.setAttribute("aria-label", "Abspielen");

  const lauf = document.createElement("input");
  lauf.type = "range";
  lauf.className = "lauf";
  lauf.min = "0";
  lauf.max = "1000";
  lauf.step = "1";
  lauf.value = "0";
  lauf.setAttribute("aria-label", "Position in der Vorlesung");

  const zeit = document.createElement("span");
  zeit.className = "zeit";
  zeit.textContent = "0:00 / 0:00";

  const anzeigen = () => {
    zeit.textContent = uhr(ton.currentTime) + " / " + uhr(ton.duration);
  };

  ton.addEventListener("play", () => {
    alleAnhalten(ton); // erst die anderen anhalten, dann läuft dieser
    knopf.textContent = "❚❚";
    knopf.setAttribute("aria-label", "Anhalten");
  });
  ton.addEventListener("pause", () => {
    knopf.textContent = "▶";
    knopf.setAttribute("aria-label", "Abspielen");
  });
  ton.addEventListener("ended", () => {
    knopf.textContent = "▶";
    knopf.setAttribute("aria-label", "Abspielen");
    lauf.value = "0";
    anzeigen();
  });
  ton.addEventListener("loadedmetadata", anzeigen);
  ton.addEventListener("timeupdate", () => {
    if (Number.isFinite(ton.duration) && ton.duration > 0) {
      lauf.value = String(Math.round((ton.currentTime / ton.duration) * 1000));
    }
    anzeigen();
  });

  knopf.onclick = () => {
    if (ton.paused) {
      ton.play().catch(() => {
        kopf.textContent = beschriftung + " — zum Anhören ▶ drücken";
      });
    } else {
      ton.pause();
    }
  };

  lauf.oninput = () => {
    if (Number.isFinite(ton.duration) && ton.duration > 0) {
      ton.currentTime = (parseInt(lauf.value, 10) / 1000) * ton.duration;
      anzeigen();
    }
  };

  streifen.append(knopf, lauf, zeit);

  const knoepfe = document.createElement("div");
  knoepfe.className = "knoepfe";

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
    ton.pause();
    spieler = spieler.filter((s) => s !== ton);
    URL.revokeObjectURL(ton.src);
    karte.remove();
  };

  knoepfe.append(sichern, loeschen);
  karte.append(kopf, streifen, knoepfe);
  ELEMENTE.klippe.prepend(karte);
  spieler.push(ton);

  ton.play().catch(() => {
    kopf.textContent = beschriftung + " — zum Anhören ▶ drücken";
  });
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
    // Sofort sperren: der neue Arbeiter hat die Stimme noch nicht. Ohne das
    // laesst sich "Vorlesen" anklicken und die Anfrage geht ins Leere.
    ELEMENTE.vorlesen.disabled = true;
    geladeneKennung = null;
    erzeugungsStatus("");
    status("Stimme wird gewechselt …");
    stimmeStart = performance.now();
    fortschritt(0, "stimme");
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
  erzeugungStart = performance.now();
  erzeugungAnteil = null;
  erzeugungsStatus("Wird erzeugt …");
  erzeugungUhrStarten();
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
