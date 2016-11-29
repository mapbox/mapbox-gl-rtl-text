#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#include <unicode/ubiditransform.h>
#include <unicode/ushape.h>
//#include <uinvchar.h>

static UBiDiTransform* transform = 0;

UChar* bidi_transform( const UChar *input, uint32_t input_length ) {
  UErrorCode errorCode = 0;

//  uint8_t *dst = 0;
//  uint8_t *src = 0;
//  uprv_eastrncpy(dst, src, 0);

  if ( !transform )
    transform = ubiditransform_open(&errorCode);

  // printf( "Transform: %u\n", transform );
  // printf( "input_length: %u\n", input_length );
  // for ( int i = 0; i < input_length; i++ )
  //   printf("%x ", input[i] );
  // printf("\n");

  uint32_t output_buffer_length = 2 * input_length;
  UChar* output = malloc( output_buffer_length * sizeof(UChar) );
  uint32_t output_length = ubiditransform_transform( transform, 
                             input, input_length,
                             output, output_buffer_length,
                             UBIDI_DEFAULT_LTR,  // Assume input is LTR unless strong RTL characters are found
                             UBIDI_LOGICAL,      // Input is in logical order
                             UBIDI_LTR,          // Output is in "visual LTR" order
                             UBIDI_VISUAL,       //  ''
                             UBIDI_MIRRORING_ON, // Use mirroring lookups for things like parentheses that need mirroring in RTL text
                             U_SHAPE_LETTERS_SHAPE, // Add options here for handling numbers in bidirectional text
                             &errorCode);

  if ( U_FAILURE( errorCode ) )
  {
    printf( "bidiTransform Error code: %u\n", errorCode );
    free( output );
    return 0;
  }

  return output;
}
