#include <unicode/ubidi.h>
#include <unicode/uchar.h>
#include <unicode/utf16.h>

static UBiDi* bidiText = 0;
static UBiDi* bidiLine = 0;

uint32_t bidiProcessText(const UChar* input, uint32_t input_length) {
    if (!bidiText) {
        bidiText = ubidi_open();
    }

    UErrorCode errorCode = U_ZERO_ERROR;
    ubidi_setPara(bidiText, input, input_length, UBIDI_DEFAULT_LTR, NULL, &errorCode);

    if (U_FAILURE(errorCode)) {
        return 0;
    }

    return ubidi_countParagraphs(bidiText);
}

uint32_t bidiGetParagraphEnd(uint32_t paragraphIndex) {
    UErrorCode errorCode = U_ZERO_ERROR;
    int32_t paragraphEndIndex = 0;
    ubidi_getParagraphByIndex(bidiText, paragraphIndex, NULL, &paragraphEndIndex, NULL, &errorCode);

    if (U_FAILURE(errorCode)) {
        return 0;
    }

    return paragraphEndIndex;
}

// Bidi_Control characters plus ZWNJ/ZWJ, which are stripped so they don't show up on screen
// (some fonts have glyphs representing them)
#define IS_BIDI_CONTROL(c)                                                                         \
    ((c) == 0x061c || ((c) & 0xfffc) == 0x200c || (uint32_t)((c) - 0x202a) < 5 ||                \
     (uint32_t)((c) - 0x2066) < 4)

// Writes text[start, end) in visual order to dest, and the logical index of each written code unit
// to map. RTL runs are reversed by code point with mirrored characters (e.g. parentheses), and BiDi
// controls are removed, so dest needs at most (end - start) code units. Returns the length or -1.
int32_t bidiWriteLine(const UChar* text, int32_t start, int32_t end, UChar* dest, int32_t* map) {
    UErrorCode errorCode = U_ZERO_ERROR;
    if (!bidiLine) {
        bidiLine = ubidi_open();
    }

    ubidi_setLine(bidiText, start, end, bidiLine, &errorCode);
    int32_t runCount = ubidi_countRuns(bidiLine, &errorCode);

    if (U_FAILURE(errorCode)) {
        return -1;
    }

    int32_t length = 0;

    for (int32_t run = 0; run < runCount; run++) {
        int32_t runStart, runLength;
        UBiDiDirection direction = ubidi_getVisualRun(bidiLine, run, &runStart, &runLength);
        runStart += start;

        if (direction == UBIDI_LTR) {
            for (int32_t i = runStart; i < runStart + runLength; i++) {
                if (!IS_BIDI_CONTROL(text[i])) {
                    map[length] = i;
                    dest[length++] = text[i];
                }
            }
        } else {
            int32_t i = runStart + runLength;
            while (i > runStart) {
                UChar32 c;
                U16_PREV(text, runStart, i, c);
                if (IS_BIDI_CONTROL(c)) {
                    continue;
                }
                // u_charMirror always returns a character with the same number of code units
                for (int32_t k = 0; k < U16_LENGTH(c); k++) {
                    map[length + k] = i + k;
                }
                U16_APPEND_UNSAFE(dest, length, u_charMirror(c));
            }
        }
    }

    return length;
}

// ubidi_setPara only calls this in UBIDI_REORDER_RUNS_ONLY mode, which we never use. Defining it
// keeps ICU's ubidiwrt and, through it, the 44KB general character property table out of the build.
int32_t ubidi_writeReordered(
    UBiDi* pBiDi, UChar* dest, int32_t destSize, uint16_t options, UErrorCode* pErrorCode) {
    *pErrorCode = U_UNSUPPORTED_ERROR;
    return 0;
}
