// Polyfill fetch for file:// URLs so WebAssembly.instantiateStreaming works in Node.js tests.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const _fetch = globalThis.fetch;

globalThis.fetch = (url, init) => {
    const href = url instanceof URL ? url.href : String(url);
    if (href.startsWith('file:')) {
        return readFile(fileURLToPath(href)).then(bytes => new Response(bytes, {headers: {'Content-Type': 'application/wasm'}}));
    }
    return _fetch(url, init);
};
