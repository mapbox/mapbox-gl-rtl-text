/**
 * Instantiates the ICU WebAssembly module and returns the RTL text functions bound to it.
 *
 * @param {Response | Promise<Response>} source The `mapbox-gl-rtl-text.wasm` file, e.g. `fetch(url)`
 * @returns {Promise<{
 *     applyArabicShaping: (input: string) => string,
 *     processBidirectionalText: (input: string, lineBreakPoints: number[]) => string[],
 *     processStyledBidirectionalText: (input: string, styleIndices: number[], lineBreakPoints: number[]) => [string, number[]][]
 * }>}
 */
export async function createRTL(source) {
    const {instance} = await WebAssembly.instantiateStreaming(source);
    const {memory, ushapeArabic, bidiProcessLines, malloc, free} = instance.exports;
    instance.exports._initialize();

    // the heap doesn't grow, so the views never detach
    const HEAPU16 = new Uint16Array(memory.buffer);
    const HEAP32 = new Int32Array(memory.buffer);
    const utf16Decoder = new TextDecoder('utf-16le');

    // Allocates the input string followed by room for `extraBytes` more bytes
    function allocString(str, extraBytes) {
        const ptr = malloc(str.length * 2 + extraBytes);
        if (!ptr) throw new Error('mapbox-gl-rtl-text: out of memory');

        for (let i = 0; i < str.length; i++) HEAPU16[(ptr >> 1) + i] = str.charCodeAt(i);
        return ptr;
    }

    function readUTF16(ptr, length) {
        return utf16Decoder.decode(new Uint16Array(memory.buffer, ptr, length));
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
        if (!input) return input;

        const ptr = allocString(input, input.length * 2);
        const outPtr = ptr + input.length * 2;
        const length = ushapeArabic(ptr, input.length, outPtr);
        const result = length < 0 ? input : readUTF16(outPtr, length);
        free(ptr);

        return result;
    }

    function processLines(input, lineBreakPoints, styleIndices) {
        if (!input) return [styleIndices ? [input, styleIndices] : input];

        // input, visual text, logical index of each visual unit, break points, line ends
        const len = input.length;
        const breakCount = lineBreakPoints.length;
        const ptr = allocString(input, len * 10 + breakCount * 8);
        const outPtr = ptr + len * 2;
        const mapIndex = (ptr + len * 4) >> 2;
        const breaksIndex = mapIndex + len;
        const lineEndsIndex = breaksIndex + breakCount;
        HEAP32.set(lineBreakPoints, breaksIndex);

        const lineCount = bidiProcessLines(ptr, len, breaksIndex << 2, breakCount, outPtr, mapIndex << 2, lineEndsIndex << 2);
        if (lineCount <= 0) {
            free(ptr);
            return lineCount ? [] : [styleIndices ? [input, styleIndices] : input];
        }

        const text = readUTF16(outPtr, HEAP32[lineEndsIndex + lineCount - 1]);
        const lines = [];

        for (let i = 0, start = 0; i < lineCount; i++) {
            const end = HEAP32[lineEndsIndex + i];
            const lineText = text.slice(start, end);
            if (styleIndices) {
                const lineStyleIndices = [];
                for (let j = start; j < end; j++) lineStyleIndices.push(styleIndices[HEAP32[mapIndex + j]]);
                lines.push([lineText, lineStyleIndices]);
            } else {
                lines.push(lineText);
            }
            start = end;
        }

        free(ptr);
        return lines;
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
        return processLines(input, lineBreakPoints);
    }

    /**
     * Takes input text in logical order and applies the BiDi algorithm using the chosen
     * line break point to generate a set of lines with the characters re-arranged into
     * visual order.
     *
     * Also takes an array of "style indices" that specify different styling on the input
     * characters (the styles are represented as integers here, the caller is responsible
     * for the actual implementation of styling). BiDi can both reorder and remove
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
    function processStyledBidirectionalText(input, styleIndices, lineBreakPoints) {
        return processLines(input, lineBreakPoints, styleIndices);
    }

    return {applyArabicShaping, processBidirectionalText, processStyledBidirectionalText};
}
