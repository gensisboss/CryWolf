const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { normalizeLevels } = require('../temp/domain-tests/LevelEditorRules.js');

test('campaign contains 50 playable UTF-8 levels without mojibake', () => {
    const file = path.join(__dirname, '..', 'assets', 'resources', 'data', 'levels.json');
    const raw = fs.readFileSync(file, 'utf8');
    const levels = normalizeLevels(JSON.parse(raw));

    assert.equal(levels.length, 50);
    assert.equal(levels[0].title, '初次护送');
    assert.equal(levels[7].title, '木箱开路');
    assert.equal(levels[9].title, '终局围栏');
    assert.doesNotMatch(raw, /锟|鍒|缇/);
    levels.forEach((entry) => {
        assert.ok(entry.goal >= 1);
        assert.ok(entry.goal <= entry.map.flat().filter((id) => id >= 10 && id <= 19).length);
        assert.ok(entry.map.every((row) => row.length === entry.map[0].length));
    });
});

test('guides introduce every mechanic at its first appearance', () => {
    const file = path.join(__dirname, '..', 'assets', 'resources', 'data', 'guides.json');
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);

    assert.deepEqual(data.guides.map((guide) => guide.level), [1, 2, 3, 4, 5, 8, 21]);
    assert.equal(data.guides[0].lines[0], '娃娃，这是你要护送的小羊。');
    assert.doesNotMatch(raw, /锟|鍒|缇/);
});

test('campaign size and density rise after levels 20 and 30', () => {
    const file = path.join(__dirname, '..', 'assets', 'resources', 'data', 'levels.json');
    const levels = normalizeLevels(JSON.parse(fs.readFileSync(file, 'utf8')));
    const countKind = (entry, min, max) => entry.map.flat().filter((id) => id >= min && id <= max).length;

    levels.slice(0, 20).forEach((entry) => {
        assert.ok(entry.map.length <= 6 && entry.map[0].length <= 6);
    });
    levels.slice(20).forEach((entry) => {
        assert.ok(entry.map.length > 6 || entry.map[0].length > 6);
    });
    levels.slice(30).forEach((entry) => {
        assert.ok(entry.map.length >= 9 && entry.map[0].length >= 9);
        assert.ok(countKind(entry, 10, 19) >= 3);
        assert.ok(countKind(entry, 20, 29) >= 2);
        assert.ok(countKind(entry, 30, 39) + countKind(entry, 60, 69) >= 8);
        assert.ok(countKind(entry, 40, 49) >= 3);
    });
});
