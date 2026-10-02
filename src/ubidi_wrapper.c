#include <unicode/ubidi.h>
#include <unicode/uchar.h>
#include <unicode/utf16.h>

static UBiDi* bidiText = 0;
static UBiDi* bidiLine = 0;

// Bidi_Control characters plus ZWNJ/ZWJ, which are stripped so they don't show up on screen
// (some fonts have glyphs representing them)
#define IS_BIDI_CONTROL(c)                                                                         \
    ((c) == 0x061c || ((c) & 0xfffc) == 0x200c || (uint32_t)((c) - 0x202a) < 5 ||                \
     (uint32_t)((c) - 0x2066) < 4)

// Splits text into lines at paragraph ends and at the (ascending) break points that fall inside
// each paragraph, and writes each line in visual order to dest, with the logical index of each
// written code unit to map. RTL runs are reversed by code point with mirrored characters (e.g.
// parentheses), and BiDi controls are removed, so dest and map need at most length entries. The end
// of each line in dest goes to lineEnds, which needs room for length + breakCount entries.
// Returns the number of lines, 0 if BiDi failed on the whole text, or -1 if it failed on a line.
int32_t bidiProcessLines(const UChar* text, int32_t length, const int32_t* breaks, int32_t breakCount,
                         UChar* dest, int32_t* map, int32_t* lineEnds) {
    UErrorCode errorCode = U_ZERO_ERROR;
    if (!bidiText) {
        bidiText = ubidi_open();
        bidiLine = ubidi_open();
    }

    ubidi_setPara(bidiText, text, length, UBIDI_DEFAULT_LTR, NULL, &errorCode);
    if (U_FAILURE(errorCode)) {
        return 0;
    }

    // collect the logical line ends first, then overwrite each with its end in dest
    int32_t lineCount = 0;
    int32_t paragraphCount = ubidi_countParagraphs(bidiText);

    for (int32_t p = 0; p < paragraphCount; p++) {
        int32_t paragraphEnd;
        ubidi_getParagraphByIndex(bidiText, p, NULL, &paragraphEnd, NULL, &errorCode);
        for (int32_t i = 0; i < breakCount; i++) {
            if (breaks[i] < paragraphEnd && (!lineCount || breaks[i] > lineEnds[lineCount - 1])) {
                lineEnds[lineCount++] = breaks[i];
            }
        }
        lineEnds[lineCount++] = paragraphEnd;
    }
    for (int32_t i = 0; i < breakCount; i++) {
        if (breaks[i] > lineEnds[lineCount - 1]) {
            lineEnds[lineCount++] = breaks[i];
        }
    }

    int32_t start = 0;
    int32_t outLength = 0;

    for (int32_t line = 0; line < lineCount; line++) {
        int32_t end = lineEnds[line];
        ubidi_setLine(bidiText, start, end, bidiLine, &errorCode);
        int32_t runCount = ubidi_countRuns(bidiLine, &errorCode);

        if (U_FAILURE(errorCode)) {
            return -1;
        }

        for (int32_t run = 0; run < runCount; run++) {
            int32_t runStart, runLength;
            UBiDiDirection direction = ubidi_getVisualRun(bidiLine, run, &runStart, &runLength);
            runStart += start;

            if (direction == UBIDI_LTR) {
                for (int32_t i = runStart; i < runStart + runLength; i++) {
                    if (!IS_BIDI_CONTROL(text[i])) {
                        map[outLength] = i;
                        dest[outLength++] = text[i];
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
                        map[outLength + k] = i + k;
                    }
                    U16_APPEND_UNSAFE(dest, outLength, u_charMirror(c));
                }
            }
        }

        lineEnds[line] = outLength;
        start = end;
    }

    return lineCount;
}

// ubidi_setPara only calls this in UBIDI_REORDER_RUNS_ONLY mode, which we never use. Defining it
// keeps ICU's ubidiwrt and, through it, the 44KB general character property table out of the build.
int32_t ubidi_writeReordered(
    UBiDi* pBiDi, UChar* dest, int32_t destSize, uint16_t options, UErrorCode* pErrorCode) {
    *pErrorCode = U_UNSUPPORTED_ERROR;
    return 0;
}
