const test = require('node:test');
const assert = require('node:assert/strict');

const {
    chooseFollowSheep,
    clampViewport,
    isInViewport,
    viewportAround,
} = require('../temp/domain-tests/ViewportRules.js');

test('viewport is always clamped to a six by six window inside the map', () => {
    assert.deepEqual(clampViewport({ row: -8, col: -3 }, 20, 30), { row: 0, col: 0 });
    assert.deepEqual(clampViewport({ row: 99, col: 99 }, 20, 30), { row: 14, col: 24 });
    assert.deepEqual(viewportAround({ row: 10, col: 15 }, 20, 30), { row: 7, col: 12 });
    assert.deepEqual(viewportAround({ row: 19, col: 29 }, 20, 30), { row: 14, col: 24 });
});

test('six by six visibility uses absolute map coordinates', () => {
    const origin = { row: 7, col: 12 };
    assert.equal(isInViewport({ row: 7, col: 12 }, origin), true);
    assert.equal(isInViewport({ row: 12, col: 17 }, origin), true);
    assert.equal(isInViewport({ row: 13, col: 17 }, origin), false);
    assert.equal(isInViewport({ row: 12, col: 18 }, origin), false);
});

test('auto follow chooses the surviving sheep that moved furthest', () => {
    const sheep = [
        { key: 'sheep-a', id: 10, kind: 'sheep', row: 2, col: 2 },
        { key: 'sheep-b', id: 11, kind: 'sheep', row: 14, col: 15 },
    ];
    const state = { sheep };
    const resolution = {
        movements: [
            { key: 'sheep-a', from: { row: 2, col: 1 }, to: { row: 2, col: 2 } },
            { key: 'sheep-b', from: { row: 14, col: 5 }, to: { row: 14, col: 15 } },
        ],
    };
    assert.equal(chooseFollowSheep(state, resolution).key, 'sheep-b');
});
