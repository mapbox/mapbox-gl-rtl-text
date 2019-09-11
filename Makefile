CPPFLAGS="-DU_CHARSET_IS_UTF8=1 -DU_CHAR_TYPE=uint_least16_t"

UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Linux)
   IN_PLACE = "-ibak"
endif
ifeq ($(UNAME_S),Darwin)
   IN_PLACE = "-i '.bak'"
endif

all: index.js mapbox-gl-rtl-text.js mapbox-gl-rtl-text.min.js mapbox-gl-rtl-text.wasm.js mapbox-gl-rtl-text.wasm.min.js

build/wrapper.js: build/ushape_wrapper.o build/ubidi_wrapper.o
	mkdir -p build
	${EMSCRIPTEN}/emcc -Oz -v -o build/wrapper.js build/ushape_wrapper.o build/ubidi_wrapper.o icu-llvm/source/lib/libicuuc.a \
	    -s EXPORTED_FUNCTIONS="['_ushape_arabic','_bidi_processText','_bidi_getLine','_bidi_getParagraphEndIndex','_bidi_setLine','_bidi_writeReverse','_bidi_getVisualRun']" \
	    -s NO_EXIT_RUNTIME="1" \
	    -s DEAD_FUNCTIONS="[]" \
	    -s NO_FILESYSTEM="1" \
	    -s INLINING_LIMIT="1" \
		-s ALLOW_MEMORY_GROWTH="1" \
	    -s EXPORTED_RUNTIME_METHODS="['stringToUTF16','UTF16ToString','ccall','_malloc','_free']" \
		-s WASM=0 \
		--llvm-lto 3 \
		--memory-init-file 0 \
		--closure 0

build/wrapper.wasm.js: build/ushape_wrapper.o build/ubidi_wrapper.o
	mkdir -p build
	${EMSCRIPTEN}/emcc -Oz -v -o build/wrapper.wasm.js build/ushape_wrapper.o build/ubidi_wrapper.o icu-llvm/source/lib/libicuuc.a \
	    -s EXPORTED_FUNCTIONS="['_ushape_arabic','_bidi_processText','_bidi_getLine','_bidi_getParagraphEndIndex','_bidi_setLine','_bidi_writeReverse','_bidi_getVisualRun']" \
	    -s NO_EXIT_RUNTIME="1" \
	    -s DEAD_FUNCTIONS="[]" \
	    -s NO_FILESYSTEM="1" \
	    -s INLINING_LIMIT="1" \
		-s ALLOW_MEMORY_GROWTH="1" \
	    -s EXPORTED_RUNTIME_METHODS="['stringToUTF16','UTF16ToString','ccall','_malloc','_free']" \
		-s WASM=1 \
	    --llvm-lto 3 \
		--memory-init-file 0 \
		--closure 0
	cp build/wrapper.wasm.wasm ./wrapper.wasm

# Using --memory-init-file 1 speeds up parsing, but requires asynchronously fetching the data. Also requires -s NO_BROWSER="0"
#--closure 1 \ # Using Closure compiler might be able to prevent non-exported functions from being included at all

# Build byte code instead of javascript, and then run it in an interpreter to avoid slow load time
# -s EMTERPRETIFY="1" \
# -s 'EMTERPRETIFY_FILE="data.binary"' \

# Even though we're building with -Oz which defaults the EMCC "ASSERTIONS" flag to 0, the emscripten runtime still includes some assertions
# that need stripping
build/wrapper_unassert.js: build/wrapper.js
	node_modules/.bin/unassert build/wrapper.js > build/wrapper_unassert.js
	sed ${IN_PLACE} 's/assert/assert_em/g' build/wrapper_unassert.js

build/wrapper_unassert.wasm.js: build/wrapper.wasm.js
	node_modules/.bin/unassert build/wrapper.wasm.js > build/wrapper_unassert.wasm.js
	sed ${IN_PLACE} 's/assert/assert_em/g' build/wrapper_unassert.wasm.js

build/ushape_wrapper.o: src/ushape_wrapper.c
	mkdir -p build
	${EMSCRIPTEN}/emcc -Oz -c src/ushape_wrapper.c -I./icu-llvm/source/common -o build/ushape_wrapper.o

build/ubidi_wrapper.o: src/ubidi_wrapper.c
	mkdir -p build
	${EMSCRIPTEN}/emcc -Oz -c src/ubidi_wrapper.c -I./icu-llvm/source/common -o build/ubidi_wrapper.o

build/icu.js: src/icu.js
	node_modules/.bin/buble src/icu.js -y dangerousForOf > build/icu.js

index.js: build/wrapper_unassert.js build/icu.js src/module-prefix.js src/module-postfix.js
	echo "(function(){" > index.js
	cat src/module-prefix.js build/wrapper_unassert.js build/icu.js src/module-postfix.js >> index.js
	echo "})();" >> index.js

mapbox-gl-rtl-text.min.js: mapbox-gl-rtl-text.js
	node_modules/.bin/uglifyjs mapbox-gl-rtl-text.js > mapbox-gl-rtl-text.min.js

mapbox-gl-rtl-text.wasm.min.js: mapbox-gl-rtl-text.wasm.js
	node_modules/.bin/uglifyjs mapbox-gl-rtl-text.wasm.js > mapbox-gl-rtl-text.wasm.min.js

mapbox-gl-rtl-text.js: build/wrapper_unassert.js build/icu.js src/module-prefix.js src/plugin-postfix.js
		echo "(function(){" > mapbox-gl-rtl-text.js
		cat src/module-prefix.js build/wrapper_unassert.js build/icu.js src/plugin-postfix.js >> mapbox-gl-rtl-text.js
		echo "})();" >> mapbox-gl-rtl-text.js

mapbox-gl-rtl-text.wasm.js: build/wrapper_unassert.wasm.js build/icu.js src/module-prefix.wasm.js src/plugin-postfix.js
		echo "(function(){" > mapbox-gl-rtl-text.wasm.js
		cat src/module-prefix.js build/wrapper_unassert.wasm.js build/icu.js src/plugin-postfix.js >> mapbox-gl-rtl-text.wasm.js
		echo "})();" >> mapbox-gl-rtl-text.wasm.js

clean:
	rm -rf build
	rm -f index.js
