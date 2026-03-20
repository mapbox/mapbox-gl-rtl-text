import test from 'node:test';
import assert from 'node:assert';

import rtlText from './src/index.js';
const {applyArabicShaping, processBidirectionalText, processStyledBidirectionalText} = await rtlText;

test('applyArabicShaping', () => {
    assert.equal(
        applyArabicShaping('سلام۳۹'),
        'ﺳﻼﻡ۳۹'
    );
});

test('Mixed numbers (left-to-right) with letters (right-to-left)', () => {
    assert.deepEqual(
        processBidirectionalText(applyArabicShaping('سلام۳۹'), []),
        ['۳۹ﻡﻼﺳ']
    );

    assert.equal(
        applyArabicShaping('مكتبة الإسكندرية‎‎ Maktabat al-Iskandarīyah'),
        'ﻣﻜﺘﺒﺔ ﺍﻹﺳﻜﻨﺪﺭﻳﺔ‎‎ Maktabat al-Iskandarīyah'
    );

    assert.deepEqual(
        processBidirectionalText(
            applyArabicShaping('مكتبة الإسكندرية‎‎ Maktabat al-Iskandarīyah'),
            []
        ),
        [' Maktabat al-Iskandarīyahﺔﻳﺭﺪﻨﻜﺳﻹﺍ ﺔﺒﺘﻜﻣ']
    );
});

test('Line breaking with bidirectional text', () => {
    assert.deepEqual(
        processBidirectionalText(
            applyArabicShaping('مكتبة الإسكندرية‎‎ Maktabat al-Iskandarīyah'),
            [18, 30]
        ),
        [' ﺔﻳﺭﺪﻨﻜﺳﻹﺍ ﺔﺒﺘﻜﻣ', 'Maktabat al-', 'Iskandarīyah']
    );
});

test('"Tashkeel" functionality', () => {
    assert.equal(
        applyArabicShaping('اليَمَن‎‎'),
        'ﺍﻟﻴﹷﻤﹷﻦ‎‎'
    );
});

test('Line breaking with styled bidirectional text', () => {
    assert.deepEqual(
        processStyledBidirectionalText(
            applyArabicShaping('مكتبة الإسكندرية‎‎ Maktabat al-Iskandarīyah'),
            [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7, 7],
            [5, 18, 30]
        ),
        [['ﺔﺒﺘﻜﻣ', [0, 0, 0, 0, 0]],
            [' ‎‎ﺔﻳﺭﺪﻨﻜﺳﻹﺍ ', [2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1]],
            ['Maktabat al-', [2, 3, 3, 3, 3, 3, 4, 5, 5, 5, 5, 6]],
            ['Iskandarīyah', [6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7, 7]]]
    );
});

test('Empty text with styled bidirectional processing', () => {
    // This reproduces the bug from maplibre-gl-js issue #6444
    // When both name and ref are empty, the result should still be a tuple [text, styleIndices]
    const result = processStyledBidirectionalText('', [], []);
    assert.ok(Array.isArray(result), 'Result should be an array');
    assert.equal(result.length, 1, 'Result should have one line');
    assert.ok(Array.isArray(result[0]), 'First line should be a tuple (array)');
    assert.equal(result[0].length, 2, 'Tuple should have 2 elements');
    assert.equal(result[0][0], '', 'Text should be empty string');
    assert.deepEqual(result[0][1], [], 'Style indices should be empty array');
});
