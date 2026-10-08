# MekoTools — Vorlesen im Browser (sherpa-onnx, WebAssembly)
#
# Drei Stufen:
#   1) stimme  — die deutsche Piper-Stimme aus dem amtlichen Modell-Release holen
#   2) wasm    — sherpa-onnx mit emscripten uebersetzen (amtliches Bau-Rezept,
#                emsdk 4.0.23). Die Stimme wird dabei in die WebAssembly-Datei
#                eingebettet ("--preload-file assets@."), deshalb braucht der
#                Browser zur Laufzeit keine Netzverbindung und keinen fremden Dienst.
#   3) dienst  — statisch ausliefern mit nginx (alpine-slim), deutsche Oberflaeche
#
# Alles Rechnen geschieht im Browser des Geraets.

FROM alpine:3.20 AS stimme
ARG STIMME=vits-piper-de_DE-thorsten_emotional-medium
RUN apk add --no-cache wget tar bzip2
WORKDIR /assets
RUN wget -q -O /tmp/m.tar.bz2 \
      "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${STIMME}.tar.bz2" \
 && tar xf /tmp/m.tar.bz2 -C /tmp \
 && mv "/tmp/${STIMME}"/*.onnx /assets/model.onnx \
 && mv "/tmp/${STIMME}/tokens.txt" /assets/tokens.txt \
 && mv "/tmp/${STIMME}/espeak-ng-data" /assets/espeak-ng-data \
 && rm -rf /tmp/m.tar.bz2 "/tmp/${STIMME}" \
 && du -sh /assets/* /assets/espeak-ng-data

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
COPY --from=stimme /assets /sherpa-onnx/wasm/tts/assets
COPY patches /tmp/patches
# Deutsche Beschriftungen in der fremden Oberflaeche (Ankerpruefung im Skript:
# findet es die Zeilen nicht mehr, bricht der Bau ab).
RUN sh /tmp/patches/app-tts-beschriftungen.sh /sherpa-onnx/wasm/tts
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
      org.opencontainers.image.description="Text zu Sprache im Browser (sherpa-onnx, WebAssembly, deutsche Stimme)"
COPY --from=wasm /opt/install/bin/wasm/tts/ /usr/share/nginx/html/
COPY web/index.html /usr/share/nginx/html/index.html
# Der WebAssembly-Typ muss richtig angekuendigt werden, sonst verweigert der
# Browser den Start (Streaming-Compilation verlangt application/wasm).
RUN grep -q "application/wasm" /etc/nginx/mime.types \
 || printf 'types { application/wasm wasm; }\n' > /etc/nginx/conf.d/wasm.conf
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1/ || exit 1
EXPOSE 80
