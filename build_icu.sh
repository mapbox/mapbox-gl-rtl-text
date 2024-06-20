#!/bin/bash

# Builds WebAssembly ICU wrapper using Emscripten SDK
#
# Usage:
#   docker run --rm -it -v $(pwd):/src emscripten/emsdk:3.1.61 /src/build_icu.sh
#
# Or for ARM64:
#   docker run --rm -it -v $(pwd):/src emscripten/emsdk:3.1.61-arm64 /src/build_icu.sh

set -x
set -eu
set -o pipefail

export CXXFLAGS="${CFLAGS:-} -std=c++17"

ARCH=$(uname -m)
if [ "$ARCH" == "aarch64" ]; then
    export HOST_ARG="aarch64-unknown-linux-gnu"
else
    export HOST_ARG="x86_64-unknown-linux-gnu"
fi

# Download ICU source code
mkdir -p build
wget -q https://github.com/unicode-org/icu/releases/download/release-75-1/icu4c-75_1-src.tgz -O ./build/icu4c.tgz
tar -xzf build/icu4c.tgz -C build

# Build ICU
pushd ./build/icu/source
./configure \
    --host $HOST_ARG \
    --enable-tools \
    --with-data-packaging=archive \
    --enable-renaming \
    --enable-strict \
    --enable-static \
    --enable-draft \
    --enable-release \
    --disable-debug \
    --disable-rpath \
    --disable-shared \
    --disable-tests \
    --disable-extras \
    --disable-tracing \
    --disable-layout \
    --disable-icuio \
    --disable-samples \
    --disable-dyload

make clean
make -j4
make install

emconfigure ./configure \
    --host $HOST_ARG \
    --with-cross-build=$(pwd) \
    --with-data-packaging=archive \
    --enable-renaming \
    --enable-strict \
    --enable-static \
    --enable-draft \
    --enable-release \
    --disable-tools \
    --disable-debug \
    --disable-rpath \
    --disable-shared \
    --disable-tests \
    --disable-extras \
    --disable-tracing \
    --disable-layout \
    --disable-icuio \
    --disable-samples \
    --disable-dyload

emmake make clean
emmake make -j4
emmake make install
popd

# Build ubidi and ushape wrappers
emcc -Oz -c ./src/ubidi_wrapper.c -o ./build/ubidi_wrapper.o -I ./build/icu/source/common/
emcc -Oz -c ./src/ushape_wrapper.c -o ./build/ushape_wrapper.o -I ./build/icu/source/common/

# Compile ICU wrapper to WebAssembly, embed all subresources as base64 string literals and export as a ES module
emcc -Oz -v -o ./src/icu.wasm.js ./build/ushape_wrapper.o ./build/ubidi_wrapper.o ./build/icu/source/lib/libicuuc.a \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s DEAD_FUNCTIONS="[]" \
    -s ENVIRONMENT="web,worker" \
    -s EXIT_RUNTIME=0 \
    -s EXPORT_ES6=1 \
    -s EXPORTED_FUNCTIONS="['_ushape_arabic','_bidi_processText','_bidi_getLine','_bidi_getParagraphEndIndex','_bidi_setLine','_bidi_writeReverse','_bidi_getVisualRun','_malloc','_free']" \
    -s EXPORTED_RUNTIME_METHODS="['stringToUTF16','UTF16ToString','ccall']" \
    -s FILESYSTEM=0 \
    -s IMPORTED_MEMORY=1 \
    -s INLINING_LIMIT=1 \
    -s MODULARIZE=1 \
    -s SINGLE_FILE=1 \
    -s WASM_ASYNC_COMPILATION=1 \
    -s WASM=1 \
    --closure 0

# Cleanup build directory
rm -rf build
