const test = require('node:test');
const assert = require('node:assert/strict');

const {
    cloneGameState,
    createInitialState,
    resolveTurn,
} = require('../temp/domain-tests/GameRules.js');

function level(map, goal = 1, moveObstacle = 0) {
    return { title: 'test', goal, moveObstacle, map };
}

test('a sheep slides into a village, escapes, and wins', () => {
    const state = createInitialState(level([[10, 0, 50]]));
    const result = resolveTurn(state, 'right', () => 0);

    assert.equal(result.state.escapedSheep, 1);
    assert.equal(result.state.sheep.length, 0);
    assert.equal(result.state.status, 'win');
    assert.deepEqual(result.events.escaped, ['sheep-0']);
});

test('front-to-back movement lets the front sheep escape while the rear sheep occupies its wake', () => {
    const state = createInitialState(level([[10, 11, 0, 50]]));
    const result = resolveTurn(state, 'right', () => 0);

    assert.equal(result.state.escapedSheep, 1);
    assert.deepEqual(result.state.sheep.map(({ key, row, col }) => ({ key, row, col })), [
        { key: 'sheep-0', row: 0, col: 2 },
    ]);
});

test('fixed obstacles block movement and boxes move in the same turn', () => {
    const fixed = resolveTurn(createInitialState(level([[10, 0, 30, 0]], 1, 0)), 'right');
    const moving = resolveTurn(createInitialState(level([[10, 0, 60, 0]], 1, 0)), 'right');

    assert.equal(fixed.state.sheep[0].col, 1);
    assert.equal(fixed.state.obstacles[0].col, 2);
    assert.equal(moving.state.sheep[0].col, 2);
    assert.equal(moving.state.boxes[0].col, 3);
});

test('characters use a box landing cell instead of its stale source cell', () => {
    const result = resolveTurn(createInitialState(level([
        [10, 0, 60, 0, 0],
        [20, 0, 61, 0, 0],
    ])), 'right', () => 0);

    assert.deepEqual(result.state.boxes.map(({ row, col }) => ({ row, col })), [
        { row: 0, col: 4 },
        { row: 1, col: 4 },
    ]);
    assert.deepEqual(
        result.movements.filter(({ kind }) => kind !== 'box').map(({ kind, to }) => ({ kind, ...to })),
        [
            { kind: 'sheep', row: 0, col: 3 },
            { kind: 'wolf', row: 1, col: 3 },
        ],
    );
});

test('traps consume sheep and wolves and are removed after landing', () => {
    const sheepResult = resolveTurn(createInitialState(level([[10, 0, 40]])), 'right');
    assert.equal(sheepResult.state.status, 'lose');
    assert.equal(sheepResult.state.traps.length, 0);
    assert.deepEqual(sheepResult.events.trappedSheep, ['sheep-0']);

    const wolfResult = resolveTurn(createInitialState(level([
        [20, 0, 40],
        [10, 0, 50],
    ])), 'right');
    assert.equal(wolfResult.state.wolves.length, 0);
    assert.deepEqual(wolfResult.events.trappedWolves, ['wolf-0']);
});

test('a surviving wolf eats one adjacent sheep after all sliding is resolved', () => {
    const state = createInitialState(level([[20, 10, 30]]));
    const result = resolveTurn(state, 'left', () => 0);

    assert.equal(result.state.sheep.length, 0);
    assert.equal(result.state.wolves[0].col, 1);
    assert.equal(result.state.status, 'lose');
    assert.deepEqual(result.events.eaten, ['sheep-1']);
    assert.equal(result.events.attacks[0].wolfKey, 'wolf-0');
});

test('wolves cannot enter villages', () => {
    const result = resolveTurn(createInitialState(level([[20, 0, 50]])), 'right');
    assert.equal(result.state.wolves[0].col, 1);
});

test('turn resolution leaves the source state untouched for replay and undo', () => {
    const state = createInitialState(level([[10, 0, 50]]));
    const snapshot = cloneGameState(state);
    resolveTurn(state, 'right');
    assert.deepEqual(state, snapshot);
});

test('winning takes precedence when the final remaining sheep reaches the goal', () => {
    const result = resolveTurn(createInitialState(level([[10, 50]])), 'right');
    assert.equal(result.state.sheep.length, 0);
    assert.equal(result.state.status, 'win');
});

test('large maps keep full movement and win logic outside the six by six viewport', () => {
    const map = Array.from({ length: 20 }, () => Array(20).fill(0));
    map[10][2] = 10;
    map[10][19] = 50;
    const result = resolveTurn(createInitialState(level(map)), 'right');

    assert.equal(result.state.rows, 20);
    assert.equal(result.state.cols, 20);
    assert.equal(result.state.escapedSheep, 1);
    assert.equal(result.state.status, 'win');
    assert.equal(result.movements[0].from.col, 2);
    assert.equal(result.movements[0].to.col, 19);
});
