/* Zwischenspeicher für Vorlesen (MekoTools).
 *
 * Warum es ihn gibt: Rechenkern (WebAssembly, ~14 MB) und Stimme (~6-20 MB)
 * sind zusammen über 20 MB. Ohne Zwischenspeicher holte der Browser sie bei
 * jedem Aufruf neu — gemessen am 08.10.2026: 108 MB je Aufruf, 25 s Wartezeit.
 *
 * Zwei Speicher:
 *   - Kern: trägt die Fassung im Namen (beim Bau eingesetzt). Ein neuer Bau
 *     räumt den alten Kern weg, damit keine alten Programmteile liegen bleiben.
 *   - Stimmen: bleibt über Bauten hinweg bestehen. Die Dateinamen tragen die
 *     Prüfsumme, ändern sich also nur, wenn sich die Stimme ändert.
 *
 * Die kleinen Textdateien (index.html, vorlesen.js, stimmen.json) kommen
 * zuerst aus dem Netz, damit Änderungen sofort ankommen; ohne Netz aus dem
 * Speicher.
 */
"use strict";

const FASSUNG = "__FASSUNG__";
const KERN = "mekotools-vorlesen-kern-" + FASSUNG;
const STIMMEN = "mekotools-vorlesen-stimmen";

const KERN_DATEIEN = [
  "sherpa-onnx-wasm-main-tts.js",
  "sherpa-onnx-wasm-main-tts.wasm",
  "sherpa-onnx-wasm-main-tts.data",
  "sherpa-onnx-tts.js",
  "sherpa-onnx-tts.worker.js",
];

const ZUERST_NETZ = ["index.html", "vorlesen.js", "stimmen/stimmen.json"];

self.addEventListener("install", (ereignis) => {
  ereignis.waitUntil(
    (async () => {
      const speicher = await caches.open(KERN);
      for (const datei of KERN_DATEIEN) {
        try {
          const antwort = await fetch(datei, { cache: "reload" });
          if (antwort.ok) await speicher.put(datei, antwort);
        } catch (fehler) {
          // Einzelne Datei nicht erreichbar: der Abruf holt sie später nach.
          console.warn("Zwischenspeicher: " + datei + " nicht geholt", fehler);
        }
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (ereignis) => {
  ereignis.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("mekotools-vorlesen-kern-") && name !== KERN) {
          await caches.delete(name);
        }
      }
      await self.clients.claim();
    })(),
  );
});

async function ausSpeicher(speicherName, anfrage) {
  const speicher = await caches.open(speicherName);
  const treffer = await speicher.match(anfrage, { ignoreSearch: true });
  if (treffer) return treffer;
  const antwort = await fetch(anfrage);
  if (antwort && antwort.ok) speicher.put(anfrage, antwort.clone());
  return antwort;
}

async function netzZuerst(anfrage) {
  const speicher = await caches.open(KERN);
  try {
    const antwort = await fetch(anfrage);
    if (antwort && antwort.ok) speicher.put(anfrage, antwort.clone());
    return antwort;
  } catch (fehler) {
    const treffer = await speicher.match(anfrage, { ignoreSearch: true });
    if (treffer) return treffer;
    throw fehler;
  }
}

self.addEventListener("fetch", (ereignis) => {
  const anfrage = ereignis.request;
  if (anfrage.method !== "GET") return;
  const adresse = new URL(anfrage.url);
  if (adresse.origin !== self.location.origin) return;

  const pfad = adresse.pathname.replace(/^\//, "");
  if (pfad.startsWith("stimmen/") && pfad.endsWith(".onnx")) {
    ereignis.respondWith(ausSpeicher(STIMMEN, anfrage));
    return;
  }
  if (ZUERST_NETZ.includes(pfad)) {
    ereignis.respondWith(netzZuerst(anfrage).catch(() => ausSpeicher(KERN, anfrage)));
    return;
  }
  if (KERN_DATEIEN.includes(pfad)) {
    ereignis.respondWith(ausSpeicher(KERN, anfrage));
  }
});
