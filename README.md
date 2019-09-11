# mapbox-gl-rtl-text.js

[![Build Status](https://circleci.com/gh/mapbox/mapbox-gl-rtl-text.svg?style=shield)](https://circleci.com/gh/mapbox/mapbox-gl-rtl-text)

An [Emscripten](https://github.com/kripken/emscripten) port of a subset of the functionality of [International Components for Unicode (ICU)](http://site.icu-project.org/) necessary for [Mapbox GL JS](https://github.com/mapbox/mapbox-gl-js) to support [right to left text rendering](https://github.com/mapbox/mapbox-gl/issues/4). Supports the Arabic and Hebrew languages, which are written right-to-left. Mapbox Studio loads this plugin by default.

**Requires [mapbox-gl-js](https://github.com/mapbox/mapbox-gl-js) (version 0.32.1 and up).**

A map that requires Arabic names should at a minimum install the `mapbox-gl-rtl-text` plugin. To display the actual place names, the map could use a specially modified style, manipulate the style at runtime, or install the [`mapbox-gl-language`](https://github.com/mapbox/mapbox-gl-language/) plugin for convenience. The `mapbox-gl-language` plugin displays Arabic name data (among other languages), while the `mapbox-gl-rtl-text` plugin adds support for displaying Arabic names. 

## Using mapbox-gl-rtl-text

mapbox-gl-rtl-text exposes two functions:

### applyArabicShaping(unicodeInput)
Takes an input string in "logical order" (i.e. characters in the order they are typed, not the order they will be displayed) and replaces Arabic characters with the "presentation form" of the character that represents the appropriate glyph based on the character's location within a word.

### processBidirectionalText(unicodeInput, lineBreakPoints)
Takes an input string with characters in "logical order", along with a set of chosen line break points, and applies the [Unicode Bidirectional Algorithm](http://unicode.org/reports/tr9/) to the string. Returns an ordered set of lines with characters in "visual order" (i.e. characters in the order they are displayed, left-to-right). The algorithm will insert mandatory line breaks (`\n` etc.) if they are not already included in `lineBreakPoints`.

`mapbox-gl-rtl-text.js`/`mapbox-gl-rtl-text.min.js` are built to be loaded directly by Mapbox GL JS using:

    setRTLTextPlugin('mapbox-gl-rtl-text.js');

 You can use ICU JS directly:
```
    var rtlText = require('mapbox-gl-rtl-text');
    var arabicString = "سلام";
    var shapedArabicText = rtlText.applyArabicShaping(arabicString);
    var readyForDisplay = rtlText.processBidirectionalText(shapedArabicText, []);
```
## Building mapbox-gl-rtl-text

Running `build.sh` will:

 - Download Emscripten
 - Download and compile ICU to LLVM bytecode
 - Run `make all`
	- Compile `ushape_wrapper.c` and `ubidi_wrapper.c` to LLVM bytecode
	- Generate `wrapper.js`, exposing bytecode sources as Javascript
	- Embed `wrapper.js` in `index.js` for use with Browserify, and `mapbox-gl-rtl-text.js` for loading directly as a GL JS plugin

Build process only tested on MacOS 10.12 and Ubuntu Xenial.

Running `npm test` will run unit tests in `test/*.test.js`. Use `npm test -- --cov` to generate code coverage stats.

## Deploying mapbox-gl-rtl-text

 - `./build.sh`
 - `npm test`
 - `npm version {patch|minor|major}`
 - `git push --follow-tags`
 - `aws s3 cp --acl public-read --content-type application/javascript mapbox-gl-rtl-text.min.js s3://mapbox-gl-js/plugins/mapbox-gl-rtl-text/v$(node --print --eval "require('./package.json').version")/mapbox-gl-rtl-text.js`

## Experimental Web Assembly support
`make all` will now build a second version of the plugin built using Web Assembly. Once wasm support is widespread, the technology promises smaller package sizes and faster load times. The output file `mapbox-gl-rtl-text.wasm.js` will try to locally load a `wrapper.wasm.wasm`. To test the wasm version of the plugin, you need to somehow host `wrapper.wasm` and modify the JavaScript wrapper to pick it up.
