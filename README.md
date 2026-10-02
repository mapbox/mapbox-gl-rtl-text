# mapbox-gl-rtl-text.js

[![CI](https://github.com/mapbox/mapbox-gl-rtl-text/actions/workflows/ci.yml/badge.svg)](https://github.com/mapbox/mapbox-gl-rtl-text/actions/workflows/ci.yml)

An [Emscripten](https://github.com/emscripten-core/emscripten) port of a subset of the functionality of [International Components for Unicode (ICU)](http://site.icu-project.org/) necessary for [Mapbox GL JS](https://github.com/mapbox/mapbox-gl-js) to support [right to left text rendering](https://github.com/mapbox/mapbox-gl/issues/4). Supports the Arabic and Hebrew languages, which are written right-to-left. Mapbox Studio loads this plugin by default.

A map that requires Arabic names should at a minimum install the `mapbox-gl-rtl-text` plugin. To display the actual place names, the map could use a specially modified style, manipulate the style at runtime, or install the [`mapbox-gl-language`](https://github.com/mapbox/mapbox-gl-language/) plugin for convenience. The `mapbox-gl-language` plugin displays Arabic name data (among other languages), while the `mapbox-gl-rtl-text` plugin adds support for displaying Arabic names.

## Using mapbox-gl-rtl-text

mapbox-gl-rtl-text exposes three functions:

### `applyArabicShaping(unicodeInput)`

Takes an input string in "logical order" (i.e. characters in the order they are typed, not the order they will be displayed) and replaces Arabic characters with the "presentation form" of the character that represents the appropriate glyph based on the character's location within a word.

### `processBidirectionalText(unicodeInput, lineBreakPoints)`

Takes an input string with characters in "logical order", along with a set of chosen line break points, and applies the [Unicode Bidirectional Algorithm](http://unicode.org/reports/tr9/) to the string. Returns an ordered set of lines with characters in "visual order" (i.e. characters in the order they are displayed, left-to-right). The algorithm will insert mandatory line breaks (`\n` etc.) if they are not already included in `lineBreakPoints`. Mirrored characters such as parentheses are flipped in right-to-left runs, and BiDi control characters are removed.

### `processStyledBidirectionalText(unicodeInput, styleIndices, lineBreakPoints)`

Same as `processBidirectionalText`, but also takes a style index for each input character and returns `[line, lineStyleIndices]` pairs, with each style index following its character to its visual position.

The package is an ES module that loads `dist/mapbox-gl-rtl-text.wasm` next to it with top-level await:

```js
import {applyArabicShaping, processBidirectionalText} from '@mapbox/mapbox-gl-rtl-text';

const arabicString = "سلام";
const shapedArabicText = applyArabicShaping(arabicString);
const readyForDisplay = processBidirectionalText(shapedArabicText, []);
```

To control where the WebAssembly comes from and when it loads, use the factory instead:

```js
import {createRTL} from '@mapbox/mapbox-gl-rtl-text/rtl.js';

const {applyArabicShaping, processBidirectionalText} = await createRTL(fetch(wasmUrl));
```

Mapbox GL JS v3 loads the plugin with `setRTLTextPlugin` and needs the [v0.4.0](https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-rtl-text/v0.4.0/mapbox-gl-rtl-text.js) build.

## Building mapbox-gl-rtl-text

* Running `npm start` serves the repo at http://localhost:5173 (with Python 3) to test the plugin in a browser. The demo takes a Mapbox access token from `?access_token=...` or asks for it.
* Running `npm test` will rebuild the wasm if needed and run unit tests in `test.js`.
* Running `npm run build` (or `make`) will rebuild `dist/mapbox-gl-rtl-text.wasm` from `src/ubidi_wrapper.c` and `src/ushape_wrapper.c` when they change (requires [Emscripten](https://emscripten.org/docs/getting_started/downloads.html)).

## Deploying mapbox-gl-rtl-text

```
npm test
npm version {patch|minor|major}
git push --follow-tags

mbx env
VERSION=$(node -p "require('./package.json').version")
aws s3 cp --acl public-read --content-type application/wasm dist/mapbox-gl-rtl-text.wasm s3://mapbox-gl-js/plugins/mapbox-gl-rtl-text/v$VERSION/mapbox-gl-rtl-text.wasm
mbx npm publish
```
