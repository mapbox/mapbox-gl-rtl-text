CPPFLAGS="-DU_CHARSET_IS_UTF8=1 -DU_CHAR_TYPE=uint_least16_t"

all: index.js

build/wrapper.js: build/ushape_wrapper.o build/ubidi_wrapper.o
	${EMSCRIPTEN}/emcc -O3 -o build/wrapper.js build/ushape_wrapper.o build/ubidi_wrapper.o icu-llvm/source/lib/libicuuc.a \
	    -s EXPORTED_FUNCTIONS="['_ushape_arabic','_bidi_processText','_bidi_getLine','_bidi_getParagraphEndIndex']" \
	    -s NO_EXIT_RUNTIME="1" \
	    -s DEAD_FUNCTIONS="[]" \
	    -s NO_FILESYSTEM="1" \
	    -s NO_BROWSER="1" \
	    -s INLINING_LIMIT="1" \
	    -s EXPORTED_RUNTIME_METHODS="['stringToUTF16','UTF16ToString','ccall']" \
	    --llvm-lto 1 \
		--memory-init-file 0

# Using --memory-init-file 1 speeds up parsing considerably, but requires asynchronously fetching the data. Also requires -s NO_BROWSER="0"
#--closure 1 \ # Using Closure compiler might shave off a little more space, but we'll be minified downstream anyway

build/ushape_wrapper.o: src/ushape_wrapper.c
	mkdir -p build
	${EMSCRIPTEN}/emcc -O3 -c src/ushape_wrapper.c -I./icu-llvm/source/common -o build/ushape_wrapper.o

build/ubidi_wrapper.o: src/ubidi_wrapper.c
	mkdir -p build
	${EMSCRIPTEN}/emcc -O3 -c src/ubidi_wrapper.c -I./icu-llvm/source/common -o build/ubidi_wrapper.o

index.js: build/wrapper.js src/icu.js src/module-prefix.js src/module-postfix.js
	echo "(function(){" > index.js
	cat src/module-prefix.js build/wrapper.js src/icu.js src/module-postfix.js >> index.js
	echo "})();" >> index.js

clean:
	rm -rf build
	rm -f wrapper.js
	rm -f index.js
