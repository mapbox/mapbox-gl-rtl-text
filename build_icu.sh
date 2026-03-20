#!/bin/bash

# Builds WebAssembly ICU wrapper using Emscripten SDK (v5)

set -x
set -eu
set -o pipefail

export CXXFLAGS="${CFLAGS:-} -std=c++17"

mkdir -p build

# Build ubidi and ushape wrappers
emcc -Oz -s USE_ICU=1 -c ./src/ubidi_wrapper.c -o ./build/ubidi_wrapper.o
emcc -Oz -s USE_ICU=1 -c ./src/ushape_wrapper.c -o ./build/ushape_wrapper.o

# Compile ICU wrapper to WebAssembly, embed all subresources as base64 string literals and export as a ES module
emcc -Oz -v -o ./src/icu.wasm.js ./build/ushape_wrapper.o ./build/ubidi_wrapper.o \
    -s USE_ICU=1 \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s DEAD_FUNCTIONS="[]" \
    -s EXIT_RUNTIME=0 \
    -s EXPORT_ES6=1 \
    -s EXPORTED_FUNCTIONS="['_ushape_arabic','_bidi_processText','_bidi_getLine','_bidi_getParagraphEndIndex','_bidi_setLine','_bidi_writeReverse','_bidi_getVisualRun','_malloc','_free']" \
    -s EXPORTED_RUNTIME_METHODS="['stringToUTF16','UTF16ToString','ccall','wasmMemory']" \
    -s FILESYSTEM=0 \
    -s IMPORTED_MEMORY=1 \
    -s INLINING_LIMIT=1 \
    -s MODULARIZE=1 \
    -s SINGLE_FILE=1 \
    -s WASM_ASYNC_COMPILATION=1 \
    -s WASM=1

# Cleanup build directory
rm -rf build
