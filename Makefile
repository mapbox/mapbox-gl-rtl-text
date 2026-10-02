EMFLAGS = -Oz -flto -sUSE_ICU=1 -sSTANDALONE_WASM --no-entry -sSUPPORT_LONGJMP=0 \
	-sMALLOC=emmalloc -sINITIAL_MEMORY=262144 -sFILESYSTEM=0 \
	-sEXPORTED_FUNCTIONS=_ushapeArabic,_bidiProcessLines,_malloc,_free

# A standalone module with no imports; src/rtl.js provides the glue
dist/mapbox-gl-rtl-text.wasm: src/ushape_wrapper.c src/ubidi_wrapper.c Makefile
	@mkdir -p dist
	emcc $(EMFLAGS) $(filter %.c,$^) -o $@
