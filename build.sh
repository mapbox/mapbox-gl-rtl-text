#!/usr/bin/env bash

function download_and_extract {
	if [ -f "$2" ] ; then
		return
	fi
	curl "$1" -o "$2"
	HASH=`git hash-object $2`
    if [ "$3" != "${HASH}" ] ; then
        echo "Hash ${HASH} of $2 doesn't match $3"
        exit 1
    fi
    tar xzf $2
}

function setup_emsdk {
	download_and_extract \
        https://s3.amazonaws.com/mozilla-games/emscripten/releases/emsdk-portable.tar.gz \
        emsdk-portable.tgz \
        a9c0b2cfdbbf21d9353754218233d2e7761e8627

	emsdk_portable/emsdk update
	emsdk_portable/emsdk install latest
	emsdk_portable/emsdk activate latest
	source emsdk_portable/emsdk_env.sh
}

function fetch_icu {
	download_and_extract \
        http://download.icu-project.org/files/icu4c/58.1/icu4c-58_1-src.tgz \
        icu58_1.tgz \
        ad6995ba349ed79dde0f25d125a9b0bb56979420
        cp -R icu icu-llvm
}

ICU_TOOLS_ROOT=`pwd`/icu/source
ICU_LLVM_ROOT=`pwd`/icu-llvm/source
export HOST_ARG="--host=x86_64-apple-darwin"

#SDK_VERSION=`xcrun --sdk macosx --show-sdk-version`
#SDK_ROOT=${XCODE_ROOT}/Platforms/MacOSX.platform/Developer
#SDK_PATH="${SDK_ROOT}/SDKs/MacOSX${SDK_VERSION}.sdk"

#MIN_SDK_VERSION_FLAG="-mmacosx-version-min=10.8"
#SYSROOT_FLAGS="-isysroot ${SDK_PATH} -arch x86_64 ${MIN_SDK_VERSION_FLAG}"
#export CFLAGS="${SYSROOT_FLAGS}"
export EMCC_CFLAGS="-O3"
export CXXFLAGS="${CFLAGS} -fvisibility-inlines-hidden -stdlib=libc++ -std=c++11"
# NOTE: OSX needs '-stdlib=libc++ -std=c++11' in both CXXFLAGS and LDFLAGS
# to correctly target c++11 for build systems that don't know about it yet (like libgeos 3.4.2)
# But because LDFLAGS is also for C libs we can only put these flags into LDFLAGS per package
#export LDFLAGS="-Wl,-search_paths_first ${SYSROOT_FLAGS}"

function build_icu_tools {
	BUILD_PREFIX="${ICU_TOOLS_ROOT}/.build"
	echo "Build ICU tools with ${HOST_ARG} in ${BUILD_PREFIX}"
	pushd ${ICU_TOOLS_ROOT}

	# Using uint_least16_t instead of char16_t because Android Clang doesn't recognize char16_t
    # I'm being shady and telling users of the library to use char16_t, so there's an implicit raw cast
    ICU_CORE_CPP_FLAGS="-DU_CHARSET_IS_UTF8=1 -DU_CHAR_TYPE=uint_least16_t"
    ICU_MODULE_CPP_FLAGS="${ICU_CORE_CPP_FLAGS} -DUCONFIG_NO_LEGACY_CONVERSION=1 -DUCONFIG_NO_BREAK_ITERATION=1"
    
    CPPFLAGS="${CPPFLAGS} ${ICU_CORE_CPP_FLAGS} ${ICU_MODULE_CPP_FLAGS} -fvisibility=hidden"
    #CXXFLAGS="--std=c++0x"

    ./configure ${HOST_ARG} --prefix=${BUILD_PREFIX} \
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
    --disable-dyload || cat config.log


    # Must do make clean after configure to clear out object files left over from previous build on different architecture
    make clean
    make -j4
    make install

    popd
}

function build_icu_llvm {
	BUILD_PREFIX="${ICU_LLVM_ROOT}/.build"
    echo "Building LLVM ICU with ${HOST_ARG} in ${BUILD_PREFIX}"
	pushd ${ICU_LLVM_ROOT}

	# llvm-ar doesn't recognize the "-c" flag ICU tries to pass in, but it's not necessary (just for suppressing output)
	sed -i '.bak' 's/ARFLAGS += -c/#ARFLAGS += -c"/g' ${ICU_LLVM_ROOT}/config/mh-darwin

    # Using uint_least16_t instead of char16_t because Android Clang doesn't recognize char16_t
    # I'm being shady and telling users of the library to use char16_t, so there's an implicit raw cast
    ICU_CORE_CPP_FLAGS="-DU_CHARSET_IS_UTF8=1 -DU_CHAR_TYPE=uint_least16_t"
    ICU_MODULE_CPP_FLAGS="${ICU_CORE_CPP_FLAGS} -DUCONFIG_NO_LEGACY_CONVERSION=1 -DUCONFIG_NO_BREAK_ITERATION=1"
    
    CPPFLAGS="${CPPFLAGS} ${ICU_CORE_CPP_FLAGS} ${ICU_MODULE_CPP_FLAGS} -fvisibility=hidden"
    #CXXFLAGS="--std=c++0x"

    emconfigure ./configure ${HOST_ARG} --prefix=${BUILD_PREFIX} \
    --with-cross-build=${ICU_TOOLS_ROOT} \
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
    --disable-dyload || cat config.log


    # Must do make clean after configure to clear out object files left over from previous build on different architecture
    emmake make clean
    emmake make -j4
    emmake make install

    popd
}

fetch_icu
build_icu_tools
setup_emsdk # Overrides build chain to point to emscripten, no more building with original toolchain
build_icu_llvm
make clean
make all
