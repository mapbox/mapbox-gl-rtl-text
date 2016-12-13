#include <stdlib.h>
#include <string.h>

#include <unicode/ushape.h>

UChar* ushape_arabic(const UChar* input, uint32_t input_length) {
    UErrorCode errorCode = U_ZERO_ERROR;

    int32_t outputLength =
        u_shapeArabic(input, input_length, NULL, 0,
                      (U_SHAPE_LETTERS_SHAPE & U_SHAPE_LETTERS_MASK) |
                          (U_SHAPE_TEXT_DIRECTION_LOGICAL & U_SHAPE_TEXT_DIRECTION_MASK),
                      &errorCode) +
        1;

    // Pre-flighting will always set U_BUFFER_OVERFLOW_ERROR
    errorCode = U_ZERO_ERROR;

    UChar* output = malloc(outputLength * sizeof(UChar));

    u_shapeArabic(input, input_length, output, outputLength,
                  (U_SHAPE_LETTERS_SHAPE & U_SHAPE_LETTERS_MASK) |
                      (U_SHAPE_TEXT_DIRECTION_LOGICAL & U_SHAPE_TEXT_DIRECTION_MASK),
                  &errorCode);

    if (U_FAILURE(errorCode)) {
        //printf("ushape_arabic Error code: %u\n", errorCode);
        free(output);
        return 0;
    }

    output[outputLength - 1] = 0;

    return output;
}
