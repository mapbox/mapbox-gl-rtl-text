(function (global, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    factory(module.exports)
  } else if (typeof define === 'function' && define.amd) {
    define(factory);
  } else {
    factory(global);
  }
}) (this, function (exports) {
var Module = {
  TOTAL_MEMORY: 8*1024*1024,
  TOTAL_STACK: 2*1024*1024 ,
  preRun: [],
  postRun: [],
  print: function( text ) {
    console.log(text);
  },
  printErr: function(text) {
    text = Array.prototype.slice.call(arguments).join(' ');
    if ( text.indexOf( 'pre-main prep time' ) >= 0 ) {
      return;
    }
    console.error(text);
  }
};
