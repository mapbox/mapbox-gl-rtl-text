#include <stdlib.h>
#include <string.h>

#include <unicode/ubidi.h>

static UBiDi* bidiText = 0;
static UBiDi* bidiLine = 0;

uint32_t bidi_processText(const UChar* input, uint32_t input_length) {
    if (!bidiText) {
        bidiText = ubidi_open();
    }

    UErrorCode errorCode = U_ZERO_ERROR;
    ubidi_setPara(bidiText, input, input_length, UBIDI_DEFAULT_LTR, NULL, &errorCode);

    if (U_FAILURE(errorCode)) {
        //printf("ubidi_setPara Error code: %u\n", errorCode);
        return 0;
    }

    return ubidi_countParagraphs(bidiText);
}

uint32_t bidi_getParagraphEndIndex(uint32_t paragraphIndex) {
    UErrorCode errorCode = U_ZERO_ERROR;
    int32_t paragraphEndIndex = 0;
    ubidi_getParagraphByIndex(bidiText, paragraphIndex, NULL, &paragraphEndIndex, NULL, &errorCode);

    if (U_FAILURE(errorCode)) {
        //printf("ubidi_getParagraphByIndex Error code: %u\n", errorCode);
        return 0;
    }

    return paragraphEndIndex;
}


uint32_t bidi_getVisualRun(uint32_t runIndex, int32_t* pLogicalStart, int32_t* pLogicalLength) {
    UBiDiDirection direction = ubidi_getVisualRun(bidiLine, runIndex, pLogicalStart, pLogicalLength);
    return direction == UBIDI_RTL ? 1 : 0;
}

uint32_t bidi_setLine(uint32_t start, uint32_t end) {
    UErrorCode errorCode = U_ZERO_ERROR;
    if (!bidiLine) {
        bidiLine = ubidi_open();
    }

    ubidi_setLine(bidiText, start, end, bidiLine, &errorCode);

    if (U_FAILURE(errorCode)) {
        //printf("ubidi_setLine Error code: %u\n", errorCode);
        return 0;
    }

    errorCode = U_ZERO_ERROR;
    uint32_t runs = ubidi_countRuns(bidiLine, &errorCode);
    if (U_FAILURE(errorCode)) {
        return 0;
    }
    return runs;
}

UChar* bidi_writeReverse(UChar* src, uint32_t logicalStart, uint32_t logicalLength) {
    UErrorCode errorCode = U_ZERO_ERROR;
    UChar* output = malloc((logicalLength + 1) * sizeof(UChar));

    // UBIDI_DO_MIRRORING: Apply unicode mirroring of characters like parentheses
    // UBIDI_REMOVE_BIDI_CONTROLS: Now that all the lines are set, remove control characters so that
    // they don't show up on screen (some fonts have glyphs representing them)
    int32_t outputLength = ubidi_writeReverse(
                            src + logicalStart,
                            logicalLength,
                            output,
                            logicalLength,
                            UBIDI_DO_MIRRORING | UBIDI_REMOVE_BIDI_CONTROLS,
                            &errorCode);

    if (U_FAILURE(errorCode)) {
        //printf("ubidi_setLine Error code: %u\n", errorCode);
        return 0;
    }

    output[outputLength] = 0;
    return output;
}

UChar* bidi_getLine(uint32_t start, uint32_t end) {
    UErrorCode errorCode = U_ZERO_ERROR;
    if (!bidiLine) {
        bidiLine = ubidi_open();
    }

    ubidi_setLine(bidiText, start, end, bidiLine, &errorCode);

    if (U_FAILURE(errorCode)) {
        //printf("ubidi_setLine Error code: %u\n", errorCode);
        return 0;
    }

    // Because we set UBIDI_REMOVE_BIDI_CONTROLS, the output may be smaller than what we reserve
    //  Setting UBIDI_INSERT_LRM_FOR_NUMERIC would require
    //  ubidi_getLength(pBiDi)+2*ubidi_countRuns(pBiDi)
    int32_t outputLength = ubidi_getProcessedLength(bidiLine) + 1;
    UChar* output = malloc(outputLength * sizeof(UChar));

    // UBIDI_DO_MIRRORING: Apply unicode mirroring of characters like parentheses
    // UBIDI_REMOVE_BIDI_CONTROLS: Now that all the lines are set, remove control characters so that
    // they don't show up on screen (some fonts have glyphs representing them)
    ubidi_writeReordered(bidiLine, output, outputLength, UBIDI_DO_MIRRORING | UBIDI_REMOVE_BIDI_CONTROLS, &errorCode);

    if (U_FAILURE(errorCode)) {
        //printf("ubidi_writeReordered Error code: %u\n", errorCode);
        return 0;
    }

    output[outputLength - 1] = 0;
    return output;
}
