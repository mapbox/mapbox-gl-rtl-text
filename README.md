# mapbox-gl-rtl-text.js

[![CI](https://github.com/mapbox/mapbox-gl-rtl-text/actions/workflows/ci.yml/badge.svg)](https://github.com/mapbox/mapbox-gl-rtl-text/actions/workflows/ci.yml)

An [Emscripten](https://github.com/emscripten-core/emscripten) port of a subset of the functionality of [International Components for Unicode (ICU)](http://site.icu-project.org/) necessary for [Mapbox GL JS](https://github.com/mapbox/mapbox-gl-js) to support [right to left text rendering](https://github.com/mapbox/mapbox-gl/issues/4). Supports the Arabic and Hebrew languages, which are written right-to-left. Mapbox Studio loads this plugin by default.

**Requires [mapbox-gl-js](https://github.com/mapbox/mapbox-gl-js) (version 0.32.1 and up).**

A map that requires Arabic names should at a minimum install the `mapbox-gl-rtl-text` plugin. To display the actual place names, the map could use a specially modified style, manipulate the style at runtime, or install the [`mapbox-gl-language`](https://github.com/mapbox/mapbox-gl-language/) plugin for convenience. The `mapbox-gl-language` plugin displays Arabic name data (among other languages), while the `mapbox-gl-rtl-text` plugin adds support for displaying Arabic names.

## Using mapbox-gl-rtl-text

mapbox-gl-rtl-text exposes two functions:

### `applyArabicShaping(unicodeInput)`

Takes an input string in "logical order" (i.e. characters in the order they are typed, not the order they will be displayed) and replaces Arabic characters with the "presentation form" of the character that represents the appropriate glyph based on the character's location within a word.

### `processBidirectionalText(unicodeInput, lineBreakPoints)`

Takes an input string with characters in "logical order", along with a set of chosen line break points, and applies the [Unicode Bidirectional Algorithm](http://unicode.org/reports/tr9/) to the string. Returns an ordered set of lines with characters in "visual order" (i.e. characters in the order they are displayed, left-to-right). The algorithm will insert mandatory line breaks (`\n` etc.) if they are not already included in `lineBreakPoints`.

`mapbox-gl-rtl-text.js` is built to be loaded directly by Mapbox GL JS using:

```js
mapboxgl.setRTLTextPlugin('mapbox-gl-rtl-text.js');
```

 You can use ICU JS directly:
```js
import rtlText from '@mapbox/mapbox-gl-rtl-text';
const {applyArabicShaping, processBidirectionalText} = await rtlText;

const arabicString = "سلام";
const shapedArabicText = applyArabicShaping(arabicString);
const readyForDisplay = processBidirectionalText(shapedArabicText, []);
```

## Building mapbox-gl-rtl-text

* Running `npm start` will spin up a local server to test the plugin in a browser.
* Running `npm test` will run unit tests in `test.js`.
* Running `npm run build:icu` will rebuild ICU WASM module:
  - Download Emscripten SDK Docker Image
  - Compile `ushape_wrapper.c` and `ubidi_wrapper.c` to LLVM bytecode
  - Generate `./src/icu.wasm.js`, exposing bytecode sources as WASM module

## Deploying mapbox-gl-rtl-text

```
npm test
npm version {patch|minor|major}
git push --follow-tags

mbx env
VERSION=v$(node -p "require('./package.json').version")
aws s3 cp --acl public-read --content-type application/javascript mapbox-gl-rtl-text.js s3://mapbox-gl-js/plugins/mapbox-gl-rtl-text/v$VERSION/mapbox-gl-rtl-text.js
mbx npm publish
```
