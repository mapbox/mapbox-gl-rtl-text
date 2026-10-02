#!/bin/bash -eux

# Builds WebAssembly ICU wrapper using Emscripten SDK

mkdir -p build dist

# Build ubidi and ushape wrappers
emcc -Oz -flto -s USE_ICU=1 -c ./src/ubidi_wrapper.c -o ./build/ubidi_wrapper.o
emcc -Oz -flto -s USE_ICU=1 -c ./src/ushape_wrapper.c -o ./build/ushape_wrapper.o

# Link a standalone module with no imports; src/rtl.js provides the glue.
emcc -Oz -flto -o ./dist/mapbox-gl-rtl-text.wasm ./build/ushape_wrapper.o ./build/ubidi_wrapper.o \
    -s USE_ICU=1 \
    -s STANDALONE_WASM \
    --no-entry \
    -s SUPPORT_LONGJMP=0 \
    -s MALLOC=emmalloc \
    -s INITIAL_MEMORY=262144 \
    -s EXPORTED_FUNCTIONS="['_ushapeArabic','_bidiProcessText','_bidiGetParagraphEnd','_bidiWriteLine','_malloc','_free']" \
    -s FILESYSTEM=0

# Cleanup build directory
rm -rf build
