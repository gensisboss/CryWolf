const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createInitialState, resolveTurn } = require('../temp/domain-tests/GameRules.js');

const solutions = [
    'up,left,left,down', 'left,down', 'left,up,right', 'up,up,left', 'left,up',
    'up,right,down,left', 'left,up,right,down', 'down,left', 'down,up,left', 'left,down,right',
    'left,right,down,right', 'up,right,right,down', 'right,up,up,left', 'down,left,right,down,left', 'down,down,left,up,left,right',
    'up,up,right,right,up', 'right,up,left,right,up,left', 'right,up,right,down', 'left,up,up,left', 'left,down,right,down,right',
    'right,down,down,right,up,left', 'left,up,right,left,down', 'right,left,up,left,up,right', 'left,up,up,right,down,left', 'up,down,right,up,up',
    'left,down,right,left,up', 'up,right,right,up,down', 'up,right,left,down,right,up', 'up,left,down,left,up,right,down', 'down,up,down,right,right,up',
    'down,left,up,left,down,left', 'down,left,up,right,up,right,down,left,up,left,up', 'up,left,down,down,left,right', 'left,up,down,right,right,down', 'down,up,left,right,down,left,up,right',
    'up,left,up,right,down,right,up', 'up,right,down,up,left,down,left', 'right,up,up,left,down,left,up', 'left,left,down,down,up,right,down,left', 'up,right,up,up,down,left,down',
].map((value) => value.split(','));

test('all generated campaign levels replay to a win', () => {
    const file = path.join(__dirname, '..', 'assets', 'resources', 'data', 'levels.json');
    const levels = JSON.parse(fs.readFileSync(file, 'utf8')).levels;
    assert.equal(solutions.length, 40);
    solutions.forEach((directions, index) => {
        let state = createInitialState(levels[index + 10]);
        directions.forEach((direction) => {
            state = resolveTurn(state, direction, () => 0).state;
        });
        assert.equal(state.status, 'win', `level ${index + 11} should be solvable`);
    });
});
