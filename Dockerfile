# MekoTools — Vorlesen im Browser (sherpa-onnx, WebAssembly)
#
# Vier Stufen:
#   1) grundlage — Grunddaten von espeak-ng und die Zeichenliste holen (aus einem
#                  kleinen Stimmenpaket) und auf das Deutsche kürzen
#   2) stimmen   — jede im Katalog angekündigte Stimme holen, nach Prüfsumme
#                  benennen, stimmen.json schreiben
#   3) wasm      — sherpa-onnx mit emscripten übersetzen. Im Paket stecken nur
#                  noch die Grunddaten (rund 3 MB statt 90 MB); die Stimme holt
#                  die Seite beim Aufruf einzeln — und nur einmal.
#   4) dienst    — statisch ausliefern mit nginx
#
# Alles Rechnen geschieht im Browser des Geräts.
#
# Vorher: die Stimme (73 MB) steckte IM WebAssembly-Paket, das Ganze war 90 MB
# groß und wurde bei jedem Aufruf erneut geladen (gemessen 08.10.2026: 108 MB,
# 25 s). Jetzt: Rechenkern 14 MB + Grunddaten 3 MB, dazu die gewählte Stimme
# (rund 5-25 MB, verkleinerte int8-Fassung) — beides bleibt im
# Zwischenspeicher des Browsers.

FROM alpine:3.20 AS grundlage
# Ein kleines Stimmenpaket liefert die Grunddaten mit (espeak-ng-data und
# tokens.txt); die Stimme selbst wird hier nicht gebraucht.
ARG GRUNDPAKET=vits-piper-de_DE-thorsten-low-int8
ARG BASIS=https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models
RUN apk add --no-cache wget tar bzip2
WORKDIR /tmp
RUN wget -q -O /tmp/m.tar.bz2 "${BASIS}/${GRUNDPAKET}.tar.bz2" \
 && mkdir -p /tmp/m && tar xf /tmp/m.tar.bz2 -C /tmp/m \
 && mkdir -p /assets \
 && cp "$(find /tmp/m -name tokens.txt | head -1)" /assets/tokens.txt \
 && cp -r "$(find /tmp/m -type d -name espeak-ng-data | head -1)" /assets/espeak-ng-data \
 && cd /assets/espeak-ng-data \
 # Wörterbücher auf Deutsch und Englisch kürzen: die übrigen 16 MB braucht eine
 # deutsche Stimme nie (gemessen: 16,5 MB -> 0,2 MB).
 && find . -name '*_dict' ! -name 'de_dict' ! -name 'en_dict' -delete \
 && find lang -type f ! -name 'de' ! -name 'en*' -delete \
 && find lang -type d -empty -delete \
 && rm -rf /tmp/m /tmp/m.tar.bz2 \
 && du -sh /assets /assets/espeak-ng-data \
 && ls -R /assets | head -20

FROM python:3.12-alpine AS stimmen
ARG FASSUNG=unbekannt
RUN apk add --no-cache ca-certificates
WORKDIR /arbeit
COPY stimmen /arbeit/stimmen
# Ein fehlendes Modell bricht den Bau ab: eine angekündigte Stimme, die nicht da
# ist, wäre ein Schalter ohne Wirkung.
RUN python3 /arbeit/stimmen/stimmen_holen.py /arbeit/stimmen/katalog.json /eingang \
 && mkdir -p /stimmen \
 && FASSUNG="${FASSUNG}" python3 /arbeit/stimmen/stimmen_manifest.py /eingang /stimmen /arbeit/stimmen/katalog.json \
 && ls -la /stimmen

FROM emscripten/emsdk:4.0.23 AS wasm
ARG SHERPA_STAND=99ddefaa9212
RUN apt-get update \
 && apt-get install -y --no-install-recommends git cmake make ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# onnxruntime fuer WebAssembly: die Bauvorschrift laedt die pruefsummengesicherte
# Datei selbst; wir legen sie vorab in /tmp ab (dort sucht sie zuerst).
RUN wget -q -O /tmp/onnxruntime-wasm-static_lib-simd-1.28.2.zip \
      https://github.com/csukuangfj/onnxruntime-libs/releases/download/v1.28.2/onnxruntime-wasm-static_lib-simd-1.28.2.zip
RUN git clone --quiet https://github.com/k2-fsa/sherpa-onnx.git /sherpa-onnx \
 && cd /sherpa-onnx \
 && git checkout --quiet "${SHERPA_STAND}" \
 && git log --oneline -1
# Grunddaten statt einer Stimme: das Paket wird dadurch rund 3 MB klein.
COPY --from=grundlage /assets /sherpa-onnx/wasm/tts/assets
COPY patches /tmp/patches
# Eingriff in den Arbeiter (Ankerpruefung im Skript: findet es die Zeilen nicht
# mehr, bricht der Bau ab). Die Oberflaeche selbst liegt in web/ und wird in der
# letzten Stufe eingesetzt.
RUN sh /tmp/patches/arbeiter-stimme.sh /sherpa-onnx/wasm/tts
ENV SHERPA_ONNX_IS_USING_BUILD_WASM_SH=ON
WORKDIR /sherpa-onnx
RUN cmake -S . -B build-wasm-simd-tts \
      -DCMAKE_INSTALL_PREFIX=/opt/install \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_TOOLCHAIN_FILE="$(dirname "$(which emcc)")/cmake/Modules/Platform/Emscripten.cmake" \
      -DSHERPA_ONNX_ENABLE_PYTHON=OFF \
      -DSHERPA_ONNX_ENABLE_TESTS=OFF \
      -DSHERPA_ONNX_ENABLE_CHECK=OFF \
      -DBUILD_SHARED_LIBS=OFF \
      -DSHERPA_ONNX_ENABLE_PORTAUDIO=OFF \
      -DSHERPA_ONNX_ENABLE_JNI=OFF \
      -DSHERPA_ONNX_ENABLE_C_API=ON \
      -DSHERPA_ONNX_ENABLE_WEBSOCKET=OFF \
      -DSHERPA_ONNX_ENABLE_GPU=OFF \
      -DSHERPA_ONNX_ENABLE_WASM=ON \
      -DSHERPA_ONNX_ENABLE_WASM_TTS=ON \
      -DSHERPA_ONNX_ENABLE_BINARY=OFF \
      -DSHERPA_ONNX_LINK_LIBSTDCPP_STATICALLY=OFF \
 && cmake --build build-wasm-simd-tts --parallel "$(nproc)" \
 && cmake --install build-wasm-simd-tts \
 && ls -lh /opt/install/bin/wasm/tts

FROM nginx:alpine-slim
# Anker zum Spiegel-Repo: ueber diesen Aufkleber verknuepft GitHub das Paket in
# GHCR mit dem Repo — erst dadurch laesst es sich oeffentlich stellen.
LABEL org.opencontainers.image.source="https://github.com/mekotools/sherpa-tts" \
      org.opencontainers.image.title="MekoTools Vorlesen" \
      org.opencontainers.image.description="Text zu Sprache im Browser (sherpa-onnx, WebAssembly, mehrere deutsche Stimmen)"
COPY --from=wasm /opt/install/bin/wasm/tts/ /usr/share/nginx/html/
# Deutsche Oberflaeche: eigene Seite, eigene Ablauflogik, Zwischenspeicher.
COPY web/index.html web/vorlesen.js web/service-worker.js /usr/share/nginx/html/
# Die Beispielseite des Projekts wird nicht mehr ausgeliefert: ihre Bedienung ist
# englisch und bietet die Stimm-Nummer statt einer Stimmenauswahl.
RUN rm -f /usr/share/nginx/html/app-tts.js
COPY --from=stimmen /stimmen /usr/share/nginx/html/stimmen/
COPY web/nginx-vorlesen.conf /etc/nginx/conf.d/vorlesen.conf
# Fassung fuer den Zwischenspeicher: aus dem Inhalt der Kerndateien gebildet,
# damit ein neuer Bau keine alten Programmteile liegen laesst.
RUN FASSUNG="$(cat /usr/share/nginx/html/sherpa-onnx-wasm-main-tts.js \
                    /usr/share/nginx/html/sherpa-onnx-wasm-main-tts.wasm \
                    /usr/share/nginx/html/sherpa-onnx-wasm-main-tts.data \
                    /usr/share/nginx/html/sherpa-onnx-tts.js \
                    /usr/share/nginx/html/sherpa-onnx-tts.worker.js \
               | sha256sum | cut -c1-12)" \
 && sed -i "s/__FASSUNG__/${FASSUNG}/" /usr/share/nginx/html/service-worker.js \
 && echo "  Fassung: ${FASSUNG}" \
 && grep -m1 "mekotools-vorlesen-kern-" /usr/share/nginx/html/service-worker.js
# Der WebAssembly-Typ muss richtig angekuendigt werden, sonst verweigert der
# Browser den Start (Streaming-Compilation verlangt application/wasm).
RUN grep -q "application/wasm" /etc/nginx/mime.types \
 || printf 'types { application/wasm wasm; }\n' > /etc/nginx/conf.d/wasm.conf
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1/ || exit 1
EXPOSE 80
