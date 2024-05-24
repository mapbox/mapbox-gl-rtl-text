#!/usr/bin/env bash

set -x
set -eu
set -o pipefail

# https://github.com/emscripten-core/emsdk/tags
EMSDK_VERSION="3.1.60"

function download_and_extract {
    if [ -f "$2" ] ; then
        return
    fi
    curl -sSfL "$1" -o "$2"
    HASH=`git hash-object $2`
    if [ "$3" != "${HASH}" ] ; then
        echo "Hash ${HASH} of $2 doesn't match $3"
        exit 1
    fi
    tar xzf $2
}

function setup_emsdk {
    download_and_extract \
        https://github.com/emscripten-core/emsdk/archive/refs/tags/${EMSDK_VERSION}.tar.gz \
        emsdk-${EMSDK_VERSION}.tar.gz \
        1a3915ace1acfb6c2f0c30386a024d9cb88ca5bd

    "emsdk-${EMSDK_VERSION}"/emsdk update
    "emsdk-${EMSDK_VERSION}"/emsdk install latest
    "emsdk-${EMSDK_VERSION}"/emsdk activate latest
    source "emsdk-${EMSDK_VERSION}/emsdk_env.sh"
}

setup_emsdk
make clean
make all
