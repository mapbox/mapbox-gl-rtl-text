
applyArabicShaping = function(input) {
    if (!input)
        return input;

    const nDataBytes = (input.length+1)*2;
    let stringInputPtr = Module._malloc(nDataBytes);
    stringToUTF16(input, stringInputPtr, nDataBytes);
    let returnStringPtr = Module.ccall('ushape_arabic', 'number', ['number','number'], [stringInputPtr,input.length]);
    Module._free(stringInputPtr);

    if (returnStringPtr === 0)
        return input;

    let result = UTF16ToString(returnStringPtr);
    Module._free(returnStringPtr);

    return result;
}

mergeParagraphLineBreakPoints = function(lineBreakPoints,paragraphCount) {
    let mergedParagraphLineBreakPoints = [];

    for (let i = 0; i < paragraphCount; i++) {
        const paragraphEndIndex = Module.ccall('bidi_getParagraphEndIndex', 'number', ['number'], [i]);
        // TODO: Handle error?

        lineBreakPoints.forEach(function(lineBreakPoint) {
            if (lineBreakPoint < paragraphEndIndex && lineBreakPoint > mergedParagraphLineBreakPoints[mergedParagraphLineBreakPoints.length-1])
                mergedParagraphLineBreakPoints.push(lineBreakPoint);
        });
        mergedParagraphLineBreakPoints.push(paragraphEndIndex);
    }
    lineBreakPoints.forEach(function(lineBreakPoint) {
        if (lineBreakPoint > mergedParagraphLineBreakPoints[mergedParagraphLineBreakPoints.length-1])
            mergedParagraphLineBreakPoints.push(lineBreakPoint);
    });
    return mergedParagraphLineBreakPoints;
}

processBidirectionalText = function(input, lineBreakPoints) {
    if (!input) {
        return [input];
    }

    const nDataBytes = (input.length+1)*2;
    let stringInputPtr = Module._malloc(nDataBytes);
    stringToUTF16(input, stringInputPtr, nDataBytes);
    const paragraphCount = Module.ccall('bidi_processText', 'number', ['number', 'number'], [stringInputPtr,input.length]);

    if (paragraphCount === 0) {
        Module._free(stringInputPtr);
        return [input]; // TODO: throw exception?
    }

    const mergedParagraphLineBreakPoints = mergeParagraphLineBreakPoints(lineBreakPoints, paragraphCount);

    let startIndex = 0;
    let lines = [];

    mergedParagraphLineBreakPoints.forEach( function(lineBreakPoint) {
        let returnStringPtr = Module.ccall('bidi_getLine', 'number', ['number', 'number'], [startIndex, lineBreakPoint]);

        if (returnStringPtr === 0) {
            Module._free(stringInputPtr);
            return []; // TODO: throw exception?
        }

        lines.push(UTF16ToString(returnStringPtr));
        Module._free(returnStringPtr);
    });

    Module._free(stringInputPtr); // Input string must live until getLine calls are finished

    return lines;
}
