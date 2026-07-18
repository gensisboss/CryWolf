const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildLevel,
    clampEditorSize,
    createEmptyMap,
    exportLevelJson,
    normalizeLevels,
    placeTile,
    resizeMap,
} = require('../temp/domain-tests/LevelEditorRules.js');

test('editor creates, places, and resizes maps without mutating prior data', () => {
    const empty = createEmptyMap(2, 3);
    const placed = placeTile(empty, 1, 2, 20);
    const resized = resizeMap(placed, 3, 2);

    assert.deepEqual(empty, [[0, 0, 0], [0, 0, 0]]);
    assert.deepEqual(placed, [[0, 0, 0], [0, 0, 20]]);
    assert.deepEqual(resized, [[0, 0], [0, 0], [0, 0]]);
});

test('editor and imported maps are limited to twenty by twenty', () => {
    assert.equal(clampEditorSize(-5, 6), 1);
    assert.equal(clampEditorSize(8.9, 6), 8);
    assert.equal(clampEditorSize(42, 6), 20);
    assert.equal(clampEditorSize(1000, 6), 20);
    assert.equal(createEmptyMap(30, 40).length, 20);
    assert.equal(createEmptyMap(30, 40)[0].length, 20);
    const oversized = Array.from({ length: 21 }, () => Array(20).fill(0));
    assert.deepEqual(normalizeLevels([{ goal: 1, map: oversized }]), []);
});

test('level normalization preserves title, goal, map, and obstacle movement', () => {
    const levels = normalizeLevels({
        levels: [{ title: '木箱开路', goal: 2, moveObstacle: 1, map: [[10, 50], [11, 30]] }],
    });

    assert.deepEqual(levels, [{
        title: '木箱开路',
        goal: 2,
        moveObstacle: 1,
        map: [[10, 50], [11, 30]],
    }]);
});

test('raw legacy maps derive a goal from their sheep count', () => {
    const levels = normalizeLevels([[[10, 11, 50]]]);
    assert.equal(levels[0].goal, 2);
});

test('editor exports one UTF-8 playable level object', () => {
    const value = buildLevel([[10, 50]], 1, 1, '自定义关卡');
    assert.equal(exportLevelJson(value), JSON.stringify({
        title: '自定义关卡',
        goal: 1,
        moveObstacle: 1,
        map: [[10, 50]],
    }, null, 2));
});
