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
