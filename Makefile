ICU_VERSION = 68.2
ICU = build/icu-$(ICU_VERSION)
ICU_OBJ = $(patsubst %,build/%.o,ubidi ubidiln ubidi_props ushape ustring cmemory umath)

CFLAGS = -Oz -flto -I$(ICU)
LDFLAGS = -sSTANDALONE_WASM --no-entry -sSUPPORT_LONGJMP=0 \
	-sMALLOC=emmalloc -sINITIAL_MEMORY=262144 -sFILESYSTEM=0 \
	-sEXPORTED_FUNCTIONS=_ushapeArabic,_bidiProcessLines,_malloc,_free

# A standalone module with no imports; src/rtl.js provides the glue
dist/mapbox-gl-rtl-text.wasm: src/ushape_wrapper.c src/ubidi_wrapper.c $(ICU_OBJ) Makefile
	@mkdir -p dist
	emcc $(CFLAGS) $(LDFLAGS) $(filter %.c %.o,$^) -o $@

# Only the ICU files we need, built at -Oz (the Emscripten ICU port builds all of it at -O2, which
# leaves the wasm about 8KB bigger even after LTO)
build/%.o: Makefile | $(ICU)
	emcc $(CFLAGS) -DU_COMMON_IMPLEMENTATION -DU_STATIC_IMPLEMENTATION -c $(ICU)/$*.cpp -o $@

$(ICU):
	mkdir -p $@
	curl -fsSL https://github.com/unicode-org/icu/releases/download/release-$(subst .,-,$(ICU_VERSION))/icu4c-$(subst .,_,$(ICU_VERSION))-src.tgz \
		| tar xz -C $@ --strip-components 3 icu/source/common
