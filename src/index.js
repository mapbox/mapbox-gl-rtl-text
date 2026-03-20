/* eslint-disable new-cap */
import icu from './icu.wasm.js';

export default (async function () {
    const Module = await icu();

    const ushapeArabic         = Module.cwrap('ushape_arabic',             'number', ['number', 'number']);
    const bidiProcessText      = Module.cwrap('bidi_processText',          'number', ['number', 'number']);
    const bidiGetParagraphEnd  = Module.cwrap('bidi_getParagraphEndIndex', 'number', ['number']);
    const bidiSetLine          = Module.cwrap('bidi_setLine',              'number', ['number', 'number']);
    const bidiGetVisualRun     = Module.cwrap('bidi_getVisualRun',         'number', ['number', 'number', 'number']);
    const bidiWriteReverse     = Module.cwrap('bidi_writeReverse',         'number', ['number', 'number', 'number']);

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

        const nDataBytes = (input.length + 1) * 2;
        const stringInputPtr = Module._malloc(nDataBytes);
        Module.stringToUTF16(input, stringInputPtr, nDataBytes);
        const returnStringPtr = ushapeArabic(stringInputPtr, input.length);
        Module._free(stringInputPtr);

        if (returnStringPtr === 0)
            return input;

        const result = Module.UTF16ToString(returnStringPtr);
        Module._free(returnStringPtr);

        return result;
    }

    function mergeParagraphLineBreakPoints(lineBreakPoints, paragraphCount) {
        const mergedParagraphLineBreakPoints = [];

        for (let i = 0; i < paragraphCount; i++) {
            const paragraphEndIndex = bidiGetParagraphEnd(i);
            // TODO: Handle error?

            for (const lineBreakPoint of lineBreakPoints) {
                if (lineBreakPoint < paragraphEndIndex &&
                    (!mergedParagraphLineBreakPoints[mergedParagraphLineBreakPoints.length - 1] || lineBreakPoint > mergedParagraphLineBreakPoints[mergedParagraphLineBreakPoints.length - 1]))
                    mergedParagraphLineBreakPoints.push(lineBreakPoint);
            }
            mergedParagraphLineBreakPoints.push(paragraphEndIndex);
        }

        for (const lineBreakPoint of lineBreakPoints) {
            if (lineBreakPoint > mergedParagraphLineBreakPoints[mergedParagraphLineBreakPoints.length - 1])
                mergedParagraphLineBreakPoints.push(lineBreakPoint);
        }

        return mergedParagraphLineBreakPoints;
    }

    // Returns { stringInputPtr, paragraphCount } or null (frees memory on failure)
    function allocAndSetParagraph(input) {
        const nDataBytes = (input.length + 1) * 2;
        const stringInputPtr = Module._malloc(nDataBytes);
        Module.stringToUTF16(input, stringInputPtr, nDataBytes);
        const paragraphCount = bidiProcessText(stringInputPtr, input.length);
        if (paragraphCount === 0) {
            Module._free(stringInputPtr);
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
        const sp = Module.stackSave();
        const logicalStartPtr = Module.stackAlloc(4);
        const logicalLengthPtr = Module.stackAlloc(4);

        for (const lineBreakPoint of mergedParagraphLineBreakPoints) {
            let lineText = '';
            const runCount = bidiSetLine(lineStartIndex, lineBreakPoint);

            if (!runCount) {
                Module.stackRestore(sp);
                Module._free(stringInputPtr);
                return [];
            }

            for (let i = 0; i < runCount; i++) {
                const isReversed = bidiGetVisualRun(i, logicalStartPtr, logicalLengthPtr);
                const logicalStart = lineStartIndex + Module.getValue(logicalStartPtr, 'i32');
                const logicalLength = Module.getValue(logicalLengthPtr, 'i32');

                if (isReversed) {
                    const returnStringPtr = bidiWriteReverse(stringInputPtr, logicalStart, logicalLength);
                    if (returnStringPtr === 0) {
                        Module.stackRestore(sp);
                        Module._free(stringInputPtr);
                        return [];
                    }
                    lineText += Module.UTF16ToString(returnStringPtr);
                    Module._free(returnStringPtr);
                } else {
                    const chunk = input.substring(logicalStart, logicalStart + logicalLength);
                    // Strip BiDi control characters, matching UBIDI_REMOVE_BIDI_CONTROLS behavior
                    lineText += hasBidiControls ? chunk.replace(BIDI_CONTROLS_RE, '') : chunk;
                }
            }

            lines.push(lineText);
            lineStartIndex = lineBreakPoint;
        }

        Module.stackRestore(sp);
        Module._free(stringInputPtr);
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

        const sp = Module.stackSave();
        const logicalStartPtr = Module.stackAlloc(4);
        const logicalLengthPtr = Module.stackAlloc(4);

        for (const lineBreakPoint of mergedParagraphLineBreakPoints) {
            let lineText = '';
            let lineStyleIndices = [];
            const runCount = bidiSetLine(lineStartIndex, lineBreakPoint);

            if (!runCount) {
                Module.stackRestore(sp);
                Module._free(stringInputPtr);
                return []; // TODO: throw exception?
            }

            for (let i = 0; i < runCount; i++) {
                const isReversed = bidiGetVisualRun(i, logicalStartPtr, logicalLengthPtr);

                const logicalStart = lineStartIndex + Module.getValue(logicalStartPtr, 'i32');
                const logicalLength = Module.getValue(logicalLengthPtr, 'i32');
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
                                Module.stackRestore(sp);
                                Module._free(stringInputPtr);
                                return [];
                            }
                            const reversed = Module.UTF16ToString(returnStringPtr);
                            Module._free(returnStringPtr);

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

        Module.stackRestore(sp);
        Module._free(stringInputPtr);

        return lines;
    }

    if (typeof self !== 'undefined' && self.registerRTLTextPlugin) {
        self.registerRTLTextPlugin({
            applyArabicShaping,
            processBidirectionalText,
            processStyledBidirectionalText
        });
    }

    return {
        applyArabicShaping,
        processBidirectionalText,
        processStyledBidirectionalText
    };
})();
