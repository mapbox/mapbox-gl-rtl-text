#include <unicode/ushape.h>

// Shaping can only merge characters (lam-alef ligatures), so dest needs at most input_length code
// units. Returns the output length or -1.
int32_t ushapeArabic(const UChar* input, int32_t input_length, UChar* dest) {
    UErrorCode errorCode = U_ZERO_ERROR;

    int32_t length = u_shapeArabic(input, input_length, dest, input_length,
                                   U_SHAPE_LETTERS_SHAPE | U_SHAPE_TEXT_DIRECTION_LOGICAL,
                                   &errorCode);

    return U_FAILURE(errorCode) ? -1 : length;
}
