import terser from '@rollup/plugin-terser';
import {wasm} from '@rollup/plugin-wasm';
import {nodeResolve} from '@rollup/plugin-node-resolve';

export default {
    input: 'src/index.js',
    output: {
        name: 'mapbox-gl-rtl-text',
        file: 'dist/mapbox-gl-rtl-text.js',
        format: 'umd',
    },
    plugins: [
        wasm({targetEnv: 'auto-inline'}),
        nodeResolve(),
        terser({
            ecma: 2020,
            module: true,
        })
    ]
};
