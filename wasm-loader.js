// Node.js ESM loader that handles .wasm imports for tests.
// Provides the same API as @rollup/plugin-wasm (a function that takes an imports
// object and returns Promise<{module, instance}>).
//
// We need both resolve and load hooks: Node.js 22+ has native WASM ESM support
// that would otherwise intercept .wasm imports before our load hook runs.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const WASM_SUFFIX = '?wasm-loader';

export function resolve(specifier, context, next) {
    if (specifier.endsWith('.wasm')) {
        // Redirect to a virtual URL that bypasses Node's native WASM handler
        const resolved = new URL(specifier, context.parentURL);
        return {url: resolved.href + WASM_SUFFIX, shortCircuit: true};
    }
    return next(specifier, context);
}

export async function load(url, context, next) {
    if (url.endsWith(WASM_SUFFIX)) {
        const realUrl = url.slice(0, -WASM_SUFFIX.length);
        const bytes = await readFile(fileURLToPath(realUrl));
        const base64 = bytes.toString('base64');
        return {
            format: 'module',
            shortCircuit: true,
            source: `const bytes = Uint8Array.from(atob('${base64}'), c => c.charCodeAt(0));
export default function(imports) { return WebAssembly.instantiate(bytes, imports); }`
        };
    }
    return next(url, context);
}
