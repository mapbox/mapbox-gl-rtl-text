var Module = {
  TOTAL_MEMORY: 16777216 * 4 * 4,
  TOTAL_STACK: 5*1024*1024 * 4,
  preRun: [],
  postRun: [],
  print: function( text ) {
    //text = Array.prototype.slice.call( arguments ).join(' ');
    // These replacements are necessary if you render to raw HTML
    //text = text.replace(/&/g, "&amp;");
    //text = text.replace(/</g, "&lt;");
    //text = text.replace(/>/g, "&gt;");
    //text = text.replace('\n', '<br>', 'g');
    console.log(text);
  },
  printErr: function(text) {
    text = Array.prototype.slice.call(arguments).join(' ');
    if ( text.indexOf( 'pre-main prep time' ) >= 0 ) {
      return;
    }
    if (0) { // XXX disabled for safety typeof dump == 'function') {
      dump(text + '\n'); // fast, straight to the real console
    } else {
      console.error(text);
    }
  }
};
