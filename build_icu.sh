#!/bin/bash

# Builds WebAssembly ICU wrapper using Emscripten SDK (v5)

set -x
set -eu
set -o pipefail

export CXXFLAGS="${CFLAGS:-} -std=c++17"

mkdir -p build

# Build ubidi and ushape wrappers
emcc -Oz -flto -s USE_ICU=1 -c ./src/ubidi_wrapper.c -o ./build/ubidi_wrapper.o
emcc -Oz -flto -s USE_ICU=1 -c ./src/ushape_wrapper.c -o ./build/ushape_wrapper.o

# Compile ICU wrapper to WebAssembly; src/index.js provides the glue, so discard the generated JS.
# Use -O1 (not -Oz) to prevent Emscripten from minifying WASM import/export names, then run
# wasm-opt -Oz separately to still get full size optimization with readable names.
emcc -O1 -flto -v -o ./src/icu.js ./build/ushape_wrapper.o ./build/ubidi_wrapper.o \
    -s USE_ICU=1 \
    -s MALLOC=emmalloc \
    -s EXPORTED_FUNCTIONS="['_ushapeArabic','_bidiProcessText','_bidiGetParagraphEndIndex','_bidiSetLine','_bidiWriteReverse','_bidiGetVisualRun','_malloc','_free']" \
    -s FILESYSTEM=0
rm ./src/icu.js
wasm-opt -Oz --enable-bulk-memory ./src/icu.wasm -o ./src/icu.wasm

# Cleanup build directory
rm -rf build
