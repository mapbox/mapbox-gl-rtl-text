'use strict';

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

function processBidirectionalText(input, lineBreakPoints) {
    if (!input) {
        return [input];
    }

    const nDataBytes = (input.length + 1) * 2;
    const stringInputPtr = Module._malloc(nDataBytes);
    Module.stringToUTF16(input, stringInputPtr, nDataBytes);
    const paragraphCount = Module.ccall('bidi_processText', 'number', ['number', 'number'], [stringInputPtr, input.length]);

    if (paragraphCount === 0) {
        Module._free(stringInputPtr);
        return [input]; // TODO: throw exception?
    }

    const mergedParagraphLineBreakPoints = mergeParagraphLineBreakPoints(lineBreakPoints, paragraphCount);

    let startIndex = 0;
    const lines = [];

    for (const lineBreakPoint of mergedParagraphLineBreakPoints) {
        const returnStringPtr = Module.ccall('bidi_getLine', 'number', ['number', 'number'], [startIndex, lineBreakPoint]);

        if (returnStringPtr === 0) {
            Module._free(stringInputPtr);
            return []; // TODO: throw exception?
        }

        lines.push(Module.UTF16ToString(returnStringPtr));
        Module._free(returnStringPtr);

        startIndex = lineBreakPoint;
    }

    Module._free(stringInputPtr); // Input string must live until getLine calls are finished

    return lines;
}
