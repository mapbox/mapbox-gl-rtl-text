# mapbox-gl-rtl-text

[![CI](https://github.com/mapbox/mapbox-gl-rtl-text/actions/workflows/ci.yml/badge.svg)](https://github.com/mapbox/mapbox-gl-rtl-text/actions/workflows/ci.yml)

A WebAssembly build of the parts of [ICU](https://icu.unicode.org/) that [Mapbox GL JS](https://github.com/mapbox/mapbox-gl-js) needs to render right-to-left text (Arabic and Hebrew): Arabic shaping and the [Unicode Bidirectional Algorithm](https://unicode.org/reports/tr9/). To show Arabic place names, combine it with a style that uses them or with [`mapbox-gl-language`](https://github.com/mapbox/mapbox-gl-language/).

## Usage

Input strings are in logical order (the order characters are typed), and output lines are in visual order (left to right, as displayed).

- `applyArabicShaping(input)` replaces Arabic characters with the presentation forms for their position in a word.
- `processBidirectionalText(input, lineBreakPoints)` splits the text into lines at the given break points (adding mandatory breaks such as `\n`) and returns the lines in visual order. Mirrored characters such as parentheses are flipped in right-to-left runs, and BiDi control characters are removed.
- `processStyledBidirectionalText(input, styleIndices, lineBreakPoints)` does the same, but takes a style index per input character and returns `[line, lineStyleIndices]` pairs with each index moved along with its character.

The main entry point loads `dist/mapbox-gl-rtl-text.wasm` with top-level await:

```js
import {applyArabicShaping, processBidirectionalText} from '@mapbox/mapbox-gl-rtl-text';

const lines = processBidirectionalText(applyArabicShaping('سلام'), []);
```

To choose where and when the wasm loads, use the factory:

```js
import {createRTL} from '@mapbox/mapbox-gl-rtl-text/rtl.js';

const {applyArabicShaping, processBidirectionalText} = await createRTL(fetch(wasmUrl));
```

Mapbox GL JS v3 loads the plugin with `setRTLTextPlugin` and needs the [v0.4.0 build](https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-rtl-text/v0.4.0/mapbox-gl-rtl-text.js).

## Development

Building the wasm requires [Emscripten](https://emscripten.org/docs/getting_started/downloads.html), the same version as CI (`EM_VERSION` in `.github/workflows/ci.yml`) for an identical build.

- `npm run build` (or `make`) builds `dist/mapbox-gl-rtl-text.wasm` from `src/*.c` when they change.
- `npm test` builds if needed, then lints and runs `test.js`.
- `npm start` serves a demo at http://localhost:5173 (needs Python 3). Pass a Mapbox token with `?access_token=...` or enter it when asked.

## Deploying

```
npm test
npm version {patch|minor|major}
git push --follow-tags

mbx env
VERSION=$(node -p "require('./package.json').version")
aws s3 cp --acl public-read --content-type application/wasm dist/mapbox-gl-rtl-text.wasm s3://mapbox-gl-js/plugins/mapbox-gl-rtl-text/v$VERSION/mapbox-gl-rtl-text.wasm
mbx npm publish
```
