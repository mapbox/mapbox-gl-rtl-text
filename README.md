# mapbox-gl-rtl-text.js

An [Emscripten](https://github.com/kripken/emscripten) port of a subset of the functionality of [International Components for Unicode (ICU)](http://site.icu-project.org/) necessary for [Mapbox GL JS](https://github.com/mapbox/mapbox-gl-js) to support [right to left text rendering](https://github.com/mapbox/mapbox-gl/issues/4). Support languages that use the Arabic script along with scripts that render right-to-left but don't require special character shaping (e.g. Hebrew).

**Requires [mapbox-gl-js](https://github.com/mapbox/mapbox-gl-js) (version 0.32.1 and up).**

## Using mapbox-gl-rtl-text

mapbox-gl-rtl-text exposes two functions:

### applyArabicShaping(unicodeInput)
Takes an input string in "logical order" (i.e. characters in the order they are typed, not the order they will be displayed) and replaces Arabic characters with the "presentation form" of the character that represents the appropriate glyph based on the character's location within a word.

### processBidirectionalText(unicodeInput, lineBreakPoints)
Takes an input string with characters in "logical order", along with a set of chosen line break points, and applies the [Unicode Bidirectional Algorithm](http://unicode.org/reports/tr9/) to the string. Returns an ordered set of lines with characters in "visual order" (i.e. characters in the order they are displayed, left-to-right). The algorithm will insert mandatory line breaks (`\n` etc.) if they are not already included in `lineBreakPoints`.

`mapbox-gl-rtl-text.js`/`mapbox-gl-rtl-text.js.min` are built to be loaded directly by Mapbox GL JS using:

    setRTLTextPlugin('mapbox-gl-rtl-text.js');

 You can use ICU JS directly:

    var rtlText = require('mapbox-gl-rtl-text');
    var arabicString = "سلام";
    var shapedArabicText = rtlText.applyArabicShaping(arabicString);
    var readyForDisplay = rtlText.processBidirectionalText(shapedArabicText, []);

Studio's preview does not yet support RTL text.

## Building mapbox-gl-rtl-text

Running `build.sh` will:

 - Download Emscripten
 - Download and compile ICU to LLVM bytecode
 - Run `make all`
	- Compile `ushape_wrapper.c` and `ubidi_wrapper.c` to LLVM bytecode
	- Generate `wrapper.js`, exposing bytecode sources as Javascript
	- Embed `wrapper.js` in `index.js` for use with Browserify, and `mapbox-gl-rtl-text.js` for loading directly as a GL JS plugin

Build process only tested on MacOS 10.12.

Running `npm test` will run unit tests in `test/*.test.js`. Use `npm test -- --cov` to generate code coverage stats.
