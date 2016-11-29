CPPFLAGS="-DU_CHARSET_IS_UTF8=1 -DU_CHAR_TYPE=uint_least16_t"

all: bidi_transform.js

wrapper.js: wrapper.o
	${EMSCRIPTEN}/emcc -O3 -o wrapper.js wrapper.o icu-llvm/source/lib/libicuuc.a \
	    -s EXPORTED_FUNCTIONS="['_bidi_transform']" \
	    -s NO_EXIT_RUNTIME="1" \
	    -s DEAD_FUNCTIONS="[]" \
	    -s NO_FILESYSTEM="1" \
	    -s INLINING_LIMIT="1" \
	    -s EXPORTED_RUNTIME_METHODS="['stringToUTF16','UTF16ToString','ccall']" \
	    --llvm-lto 1 \
		--memory-init-file 1


wrapper.o: src/wrapper.c
	${EMSCRIPTEN}/emcc -O3 -c src/wrapper.c -I./icu-llvm/source/common -o wrapper.o

bidi_transform.js: wrapper.js src/icu.js src/module-prefix.js src/module-postfix.js
	echo "(function(){" > bidi_transform.js
	cat src/module-prefix.js wrapper.js src/icu.js src/module-postfix.js >> bidi_transform.js
	echo "})();" >> bidi_transform.js

bidi_transform.min.js: bidi_transform.js
	npm install uglifyjs
	./node_modules/.bin/uglifyjs bidi_transform.js -o bidi_transform.min.js --compress --mangle

clean:
	rm -f wrapper.o
	rm -f wrapper.js
	rm -f bidi_transform.js
	rm -f bidi_transform.min.js

#-s EXPORTED_RUNTIME_METHODS="['stringToUTF16','UTF16ToString']" \
#-s NO_BROWSER="1" \ # has to be turned off if memory-init-file is used?
#--closure 1 \ # Enabling closure leads to error 'stringToUTF16 is not defined', not sure why, but it only saves 20KB? There are two other minifiers -- uglifjs and the "asm.js" minifier
#--llvm-lto 1 \