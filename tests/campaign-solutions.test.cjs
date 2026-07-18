const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createInitialState, resolveTurn } = require('../temp/domain-tests/GameRules.js');

const directions = ['up', 'down', 'left', 'right'];

function stateKey(state) {
    const entities = (items) => items.map((item) => `${item.key}:${item.row},${item.col}`).sort().join('|');
    return [
        state.escapedSheep,
        entities(state.sheep),
        entities(state.wolves),
        entities(state.obstacles),
        state.traps.map((item) => `${item.row},${item.col}`).sort().join('|'),
    ].join(';');
}

function solve(level, maxDepth = 20, maxStates = 200000) {
    const initial = createInitialState(level);
    const queue = [{ state: initial, depth: 0 }];
    const seen = new Set([stateKey(initial)]);
    for (let cursor = 0; cursor < queue.length && cursor < maxStates; cursor += 1) {
        const current = queue[cursor];
        if (current.depth >= maxDepth) continue;
        for (const direction of directions) {
            const state = resolveTurn(current.state, direction, () => 0).state;
            if (state.status === 'win') return true;
            if (state.status === 'lose') continue;
            const key = stateKey(state);
            if (seen.has(key)) continue;
            seen.add(key);
            queue.push({ state, depth: current.depth + 1 });
        }
    }
    return false;
}

test('all generated campaign levels replay to a win', () => {
    const file = path.join(__dirname, '..', 'assets', 'resources', 'data', 'levels.json');
    const levels = JSON.parse(fs.readFileSync(file, 'utf8')).levels;
    levels.slice(10).forEach((level, index) => {
        assert.equal(solve(level), true, `level ${index + 11} should be solvable`);
    });
});
