'use strict';


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
    const returnStringPtr = Module.ccall('ushape_arabic', 'number', ['number', 'number'], [stringInputPtr, input.length]);
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
        const paragraphEndIndex = Module.ccall('bidi_getParagraphEndIndex', 'number', ['number'], [i]);
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

// This function is stateful: it sets a static BiDi paragaph object
// on the "native" side
function setParagraph(input, stringInputPtr, nDataBytes) {
    if (!input) {
        return null;
    }

    Module.stringToUTF16(input, stringInputPtr, nDataBytes);
    const paragraphCount = Module.ccall('bidi_processText', 'number', ['number', 'number'], [stringInputPtr, input.length]);

    if (paragraphCount === 0) {
        Module._free(stringInputPtr);
        return null;
    }
    return paragraphCount;
}

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
    const nDataBytes = (input.length + 1) * 2;
    const stringInputPtr = Module._malloc(nDataBytes);
    const paragraphCount = setParagraph(input, stringInputPtr, nDataBytes);
    if (!paragraphCount) {
        return [input];
    }

    const mergedParagraphLineBreakPoints = mergeParagraphLineBreakPoints(lineBreakPoints, paragraphCount);

    let lineStartIndex = 0;
    const lines = [];

    for (const lineBreakPoint of mergedParagraphLineBreakPoints) {
        const returnStringPtr = Module.ccall('bidi_getLine', 'number', ['number', 'number'], [lineStartIndex, lineBreakPoint]);

        if (returnStringPtr === 0) {
            Module._free(stringInputPtr);
            return []; // TODO: throw exception?
        }

        lines.push(Module.UTF16ToString(returnStringPtr));
        Module._free(returnStringPtr);

        lineStartIndex = lineBreakPoint;
    }

    Module._free(stringInputPtr); // Input string must live until getLine calls are finished

    return lines;
}

function createInt32Ptr() {
    return Module._malloc(4);
}

function consumeInt32Ptr(ptr) {
    const heapView = new Int32Array(Module.HEAPU8.buffer, ptr, 1);
    const result = heapView[0];
    Module._free(ptr);
    return result;
}

function writeReverse(stringInputPtr, logicalStart, logicalEnd) {
    const returnStringPtr = Module.ccall('bidi_writeReverse', 'number', ['number', 'number', 'number'], [stringInputPtr, logicalStart, logicalEnd - logicalStart]);

    if (returnStringPtr === 0) {
        return null;
    }
    const reversed = Module.UTF16ToString(returnStringPtr);
    Module._free(returnStringPtr);
    return reversed;
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
    const nDataBytes = (text.length + 1) * 2;
    const stringInputPtr = Module._malloc(nDataBytes);
    const paragraphCount = setParagraph(text, stringInputPtr, nDataBytes);
    if (!paragraphCount) {
        return [{text, styleIndices}];
    }

    const mergedParagraphLineBreakPoints = mergeParagraphLineBreakPoints(lineBreakPoints, paragraphCount);

    let lineStartIndex = 0;
    const lines = [];

    for (const lineBreakPoint of mergedParagraphLineBreakPoints) {
        let lineText = "";
        let lineStyleIndices = [];
        const runCount = Module.ccall('bidi_setLine', 'number', ['number', 'number'], [lineStartIndex, lineBreakPoint]);

        if (!runCount) {
            Module._free(stringInputPtr);
            return []; // TODO: throw exception?
        }

        for (let i = 0; i < runCount; i++) {
            const logicalStartPtr = createInt32Ptr();
            const logicalLengthPtr = createInt32Ptr();
            const isReversed = Module.ccall('bidi_getVisualRun', 'number', ['number', 'number', 'number'], [i, logicalStartPtr, logicalLengthPtr]);

            const logicalStart = lineStartIndex + consumeInt32Ptr(logicalStartPtr);
            const logicalLength = consumeInt32Ptr(logicalLengthPtr);
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
                        const reversed = writeReverse(stringInputPtr, styleRunEnd, styleRunStart);
                        if (!reversed) {
                            Module._free(stringInputPtr);
                            return [];
                        }
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

    Module._free(stringInputPtr); // Input string must live until getLine calls are finished

    return lines;
}
