import terser from '@rollup/plugin-terser';

export default {
    input: 'src/index.js',
    output: {
        file: 'dist/mapbox-gl-rtl-text.js',
        format: 'es',
    },
    plugins: [
        terser({ecma: 2020, module: true}),
    ]
};
