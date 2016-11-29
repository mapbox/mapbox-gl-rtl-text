var bidiTransform = function( input ) {
  if ( !input )
    return input;

  var nDataBytes = (input.length+1)*2;
  var stringInputPtr = Module._malloc(nDataBytes);
  //console.log( "Input: " + input );
  stringToUTF16( input, stringInputPtr, nDataBytes );
  var returnStringPtr = Module.ccall( 'bidi_transform', 'number', ['number','number'], [stringInputPtr,input.length] );
  Module._free( stringInputPtr );
  if ( returnStringPtr === 0 )
    return input;
  var result = UTF16ToString( returnStringPtr );
  //console.log( "Output: " + result );
  Module._free( returnStringPtr );
  return result;
};
