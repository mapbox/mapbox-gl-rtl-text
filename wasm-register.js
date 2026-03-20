import {register} from 'node:module';
import {pathToFileURL} from 'node:url';
register('./wasm-loader.js', pathToFileURL('./'));
