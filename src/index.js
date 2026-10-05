import {createRTL} from './rtl.js';

export {createRTL};

export const {
    applyArabicShaping,
    processBidirectionalText,
    processStyledBidirectionalText
} = await createRTL(fetch(new URL('../dist/mapbox-gl-rtl-text.wasm', import.meta.url)));
