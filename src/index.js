import initWasm from './icu.wasm';

export default (async function () {
    const {instance} = await initWasm({
        env: {
            emscripten_resize_heap() { return 0; },
            _abort_js() { throw new Error('abort'); },
            _setitimer_js() {},
            _emscripten_runtime_keepalive_clear() {},
        },
        wasi_snapshot_preview1: {
            proc_exit() {},
        }
    });

    instance.exports.__wasm_call_ctors();
    const mem = instance.exports.memory.buffer;
    const HEAPU8  = new Uint8Array(mem);
    const HEAPU16 = new Uint16Array(mem);
    const HEAP32  = new Int32Array(mem);

    const {
        ushapeArabic,
        bidiProcessText,
        bidiGetParagraphEnd,
        bidiSetLine,
        bidiGetVisualRun,
        bidiWriteReverse,
        malloc,
        free,
    } = instance.exports;

    const utf16Decoder = new TextDecoder('utf-16le');

    function readUTF16(ptr) {
        let end = ptr >> 1;
        while (HEAPU16[end]) end++;
        return utf16Decoder.decode(HEAPU8.subarray(ptr, end << 1));
    }

    function writeUTF16(str, ptr) {
        const offset = ptr >> 1;
        for (let i = 0; i < str.length; i++) HEAPU16[offset + i] = str.charCodeAt(i);
        HEAPU16[offset + str.length] = 0;
    }

    /**
     * Takes logical input and replaces Arabic characters with the "presentation form"
     * of their initial/medial/final forms, based on their order in the input.
     *
     * The results are still in logical order.
     *
     * @param {string} [input] Input text in logical order
     * @returns {string} Transformed text using Arabic presentation forms
     */
    function applyArabicShaping(input) {
        if (!input)
            return input;

        const stringInputPtr = malloc((input.length + 1) * 2);
        writeUTF16(input, stringInputPtr);
        const returnStringPtr = ushapeArabic(stringInputPtr, input.length);
        free(stringInputPtr);

        if (returnStringPtr === 0)
            return input;

        const result = readUTF16(returnStringPtr);
        free(returnStringPtr);

        return result;
    }

    function mergeParagraphLineBreakPoints(lineBreakPoints, paragraphCount) {
        const merged = [];

        for (let i = 0; i < paragraphCount; i++) {
            const paragraphEnd = bidiGetParagraphEnd(i);
            for (const breakPoint of lineBreakPoints) {
                if (breakPoint < paragraphEnd && (!merged.length || breakPoint > merged[merged.length - 1]))
                    merged.push(breakPoint);
            }
            merged.push(paragraphEnd);
        }

        for (const breakPoint of lineBreakPoints) {
            if (breakPoint > merged[merged.length - 1])
                merged.push(breakPoint);
        }

        return merged;
    }

    // Returns { stringInputPtr, paragraphCount } or null (frees memory on failure)
    function allocAndSetParagraph(input) {
        const stringInputPtr = malloc((input.length + 1) * 2);
        writeUTF16(input, stringInputPtr);
        const paragraphCount = bidiProcessText(stringInputPtr, input.length);
        if (paragraphCount === 0) {
            free(stringInputPtr);
            return null;
        }
        return {stringInputPtr, paragraphCount};
    }

    const BIDI_CONTROLS_RE = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

    /**
     * Takes input text in logical order and applies the BiDi algorithm using the chosen
     * line break point to generate a set of lines with the characters re-arranged into
     * visual order.
     *
     * @param {string} [input] Input text in logical order
     * @param {Array<number>} [lineBreakPoints] Each line break is an index into the input string
     *
     * @returns {Array<string>} One string per line, with each string in visual order
     */
    function processBidirectionalText(input, lineBreakPoints) {
        const setup = allocAndSetParagraph(input);
        if (!setup) return [input];

        const hasBidiControls = input.search(BIDI_CONTROLS_RE) !== -1;

        const {stringInputPtr, paragraphCount} = setup;
        const mergedParagraphLineBreakPoints = mergeParagraphLineBreakPoints(lineBreakPoints, paragraphCount);

        let lineStartIndex = 0;
        const lines = [];
        const outPtr = malloc(8);
        const outIdx = outPtr >> 2;

        for (const lineBreakPoint of mergedParagraphLineBreakPoints) {
            let lineText = '';
            const runCount = bidiSetLine(lineStartIndex, lineBreakPoint);

            if (!runCount) {
                free(outPtr);
                free(stringInputPtr);
                return [];
            }

            for (let i = 0; i < runCount; i++) {
                const isReversed = bidiGetVisualRun(i, outPtr, outPtr + 4);
                const logicalStart = lineStartIndex + HEAP32[outIdx];
                const logicalLength = HEAP32[outIdx + 1];

                if (isReversed) {
                    const returnStringPtr = bidiWriteReverse(stringInputPtr, logicalStart, logicalLength);
                    if (returnStringPtr === 0) {
                        free(outPtr);
                        free(stringInputPtr);
                        return [];
                    }
                    lineText += readUTF16(returnStringPtr);
                    free(returnStringPtr);
                } else {
                    const chunk = input.substring(logicalStart, logicalStart + logicalLength);
                    // Strip BiDi control characters, matching UBIDI_REMOVE_BIDI_CONTROLS behavior
                    lineText += hasBidiControls ? chunk.replace(BIDI_CONTROLS_RE, '') : chunk;
                }
            }

            lines.push(lineText);
            lineStartIndex = lineBreakPoint;
        }

        free(outPtr);
        free(stringInputPtr);
        return lines;
    }

    /**
     * Takes input text in logical order and applies the BiDi algorithm using the chosen
     * line break point to generate a set of lines with the characters re-arranged into
     * visual order.
     *
     * Also takes an array of "style indices" that specify different styling on the input
     * characters (the styles are represented as integers here, the caller is responsible
     * for the actual implementation of styling). BiDi can both reorder and add/remove
     * characters from the input string, but this function copies style information from
     * the "source" logical characters to their corresponding visual characters in the output.
     *
     * @param {string} [input] Input text in logical order
     * @param {Array<number>} [styleIndices] Same length as input text, each entry represents the style
     *                                       of the corresponding input character.
     * @param {Array<number>} [lineBreakPoints] Each line break is an index into the input string
     * @returns {Array<[string,Array<number>>]} One string per line, with each string in visual order.
     *                               Each string has a matching array of style indices in the same order.
     */
    function processStyledBidirectionalText(text, styleIndices, lineBreakPoints) {
        const setup = allocAndSetParagraph(text);
        if (!setup) return [[text, styleIndices]];

        const {stringInputPtr, paragraphCount} = setup;

        const mergedParagraphLineBreakPoints = mergeParagraphLineBreakPoints(lineBreakPoints, paragraphCount);

        let lineStartIndex = 0;
        const lines = [];

        const outPtr = malloc(8);
        const outIdx = outPtr >> 2;

        for (const lineBreakPoint of mergedParagraphLineBreakPoints) {
            let lineText = '';
            let lineStyleIndices = [];
            const runCount = bidiSetLine(lineStartIndex, lineBreakPoint);

            if (!runCount) {
                free(outPtr);
                free(stringInputPtr);
                return []; // TODO: throw exception?
            }

            for (let i = 0; i < runCount; i++) {
                const isReversed = bidiGetVisualRun(i, outPtr, outPtr + 4);

                const logicalStart = lineStartIndex + HEAP32[outIdx];
                const logicalLength = HEAP32[outIdx + 1];
                const logicalEnd = logicalStart + logicalLength;
                if (isReversed) {
                    // Within this reversed section, iterate logically backwards
                    // Each time we see a change in style, render a reversed chunk
                    // of everything since the last change
                    let styleRunStart = logicalEnd;
                    let currentStyleIndex = styleIndices[styleRunStart - 1];
                    for (let j = logicalEnd - 1; j >= logicalStart; j--) {
                        if (currentStyleIndex !== styleIndices[j] || j === logicalStart) {
                            const styleRunEnd = j === logicalStart ? j : j + 1;
                            const returnStringPtr = bidiWriteReverse(stringInputPtr, styleRunEnd, styleRunStart - styleRunEnd);

                            if (returnStringPtr === 0) {
                                free(outPtr);
                                free(stringInputPtr);
                                return [];
                            }
                            const reversed = readUTF16(returnStringPtr);
                            free(returnStringPtr);

                            lineText += reversed;
                            for (let k = 0; k < reversed.length; k++) {
                                lineStyleIndices.push(currentStyleIndex);
                            }
                            currentStyleIndex = styleIndices[j];
                            styleRunStart = styleRunEnd;
                        }
                    }

                } else {
                    lineText += text.substring(logicalStart, logicalEnd);
                    lineStyleIndices = lineStyleIndices.concat(styleIndices.slice(logicalStart, logicalEnd));
                }
            }

            lines.push([lineText, lineStyleIndices]);
            lineStartIndex = lineBreakPoint;
        }

        free(outPtr);
        free(stringInputPtr);

        return lines;
    }

    const rtl = {
        applyArabicShaping,
        processBidirectionalText,
        processStyledBidirectionalText
    };

    if (typeof self !== 'undefined' && self.registerRTLTextPlugin) {
        self.registerRTLTextPlugin(rtl);
    }

    return rtl;
})();
