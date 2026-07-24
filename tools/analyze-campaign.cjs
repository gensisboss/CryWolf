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
        entities(state.boxes),
        state.traps.map((item) => `${item.row},${item.col}`).sort().join('|'),
    ].join(';');
}

function analyze(level, maxDepth = 20, maxStates = 30000) {
    const initial = createInitialState(level);
    const queue = [{ state: initial, depth: 0 }];
    const seen = new Set([stateKey(initial)]);
    let losses = 0;
    for (let cursor = 0; cursor < queue.length && cursor < maxStates; cursor += 1) {
        const current = queue[cursor];
        if (current.depth >= maxDepth) continue;
        for (const direction of directions) {
            const state = resolveTurn(current.state, direction, () => 0).state;
            if (state.status === 'win') return { depth: current.depth + 1, states: seen.size, losses };
            if (state.status === 'lose') {
                losses += 1;
                continue;
            }
            const key = stateKey(state);
            if (seen.has(key)) continue;
            seen.add(key);
            queue.push({ state, depth: current.depth + 1 });
        }
    }
    return { depth: null, states: seen.size, losses };
}

const levelsPath = path.join(__dirname, '..', 'assets', 'resources', 'data', 'levels.json');
const levels = JSON.parse(fs.readFileSync(levelsPath, 'utf8')).levels;
levels.forEach((level, index) => {
    const result = analyze(level);
    const sheep = level.map.flat().filter((id) => id >= 10 && id < 20).length;
    const harderGoal = Math.min(sheep, level.goal + 1);
    const harder = index >= 10 && level.goal < sheep ? analyze({ ...level, goal: harderGoal }) : null;
    const harderText = harder ? ` g${harderGoal}=${harder.depth ?? '-'}(${harder.states})` : '';
    console.log(`${String(index + 1).padStart(2, '0')} goal=${level.goal}/${sheep} depth=${result.depth ?? '-'} states=${result.states} losses=${result.losses}${harderText}`);
});
