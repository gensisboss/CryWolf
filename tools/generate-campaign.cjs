const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const { createInitialState, resolveTurn } = require(path.join(root, 'temp', 'domain-tests', 'GameRules.js'));
const levelFile = path.join(root, 'assets', 'resources', 'data', 'levels.json');
const guideFile = path.join(root, 'assets', 'resources', 'data', 'guides.json');
const original = JSON.parse(fs.readFileSync(levelFile, 'utf8')).levels.slice(0, 10);

let seed = 0x43525957;
const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
};
const integer = (min, max) => min + Math.floor(random() * (max - min + 1));
const directions = ['up', 'down', 'left', 'right'];

function stateKey(state) {
    const entities = (items) => items.map((item) => `${item.key}:${item.row},${item.col}`).sort().join('|');
    return [state.escapedSheep, entities(state.sheep), entities(state.wolves), entities(state.obstacles), state.traps.map((item) => `${item.row},${item.col}`).sort().join('|')].join(';');
}

function solve(level, maxDepth, maxStates = 10000) {
    const initial = createInitialState(level);
    const queue = [{ state: initial, path: [] }];
    const seen = new Set([stateKey(initial)]);
    for (let cursor = 0; cursor < queue.length && cursor < maxStates; cursor += 1) {
        const current = queue[cursor];
        if (current.path.length >= maxDepth) continue;
        for (const direction of directions) {
            const result = resolveTurn(current.state, direction, () => 0);
            if (result.state.status === 'win') return [...current.path, direction];
            if (result.state.status === 'lose') continue;
            const key = stateKey(result.state);
            if (key === stateKey(current.state) || seen.has(key)) continue;
            seen.add(key);
            queue.push({ state: result.state, path: [...current.path, direction] });
        }
    }
    return null;
}

function createCandidate(levelNumber, rows, cols, sheepCount, obstacleCount, trapCount, wolfCount, moving) {
    const map = Array.from({ length: rows }, () => Array(cols).fill(0));
    const free = [];
    for (let row = 0; row < rows; row += 1) for (let col = 0; col < cols; col += 1) free.push([row, col]);
    const take = () => free.splice(integer(0, free.length - 1), 1)[0];
    const put = (id) => {
        const [row, col] = take();
        map[row][col] = id;
    };
    for (let index = 0; index < sheepCount; index += 1) put(10 + index % 5);
    for (let index = 0; index < sheepCount; index += 1) put(50 + index % 4);
    for (let index = 0; index < obstacleCount; index += 1) put(30 + index % 4);
    for (let index = 0; index < trapCount; index += 1) put(40 + index % 4);
    for (let index = 0; index < wolfCount; index += 1) put(20 + index % 5);
    return {
        title: `第${levelNumber}程`,
        goal: Math.max(1, Math.ceil(sheepCount / 2)),
        map,
        moveObstacle: moving ? 1 : 0,
    };
}

const titles = [
    '山路复习', '双向折返', '村口石阵', '陷阱小径', '狼群间隙',
    '三路会合', '静石迷阵', '诱狼入谷', '移动木阵', '六格终考',
    '远野初行', '长谷转向', '小地图巡路', '河湾双羊', '远村狼影',
    '八格石林', '陷阱长廊', '移动边界', '群羊远征', '大地图试炼',
    '危谷入口', '狼群合围', '活动石阵', '多村抉择', '陷阱棋局',
    '远路四羊', '双狼封口', '流动迷宫', '山谷连锁', '暴风前夜',
    '绝壁狼踪', '移动牢笼', '五羊分流', '陷阱回廊', '群狼逐路',
    '石阵迁徙', '远村危机', '多线护送', '猎场反转', '险峰会师',
];

const generated = [];
const solutions = [];
for (let levelNumber = 11; levelNumber <= 50; levelNumber += 1) {
    const large = levelNumber >= 21;
    const hard = levelNumber >= 31;
    const rows = large ? integer(hard ? 9 : 7, hard ? 12 : 9) : 6;
    const cols = large ? integer(hard ? 9 : 7, hard ? 12 : 9) : 6;
    const sheepCount = hard ? integer(3, 4) : levelNumber >= 21 ? integer(2, 3) : 2;
    const obstacleCount = hard ? integer(8, 13) : levelNumber >= 21 ? integer(5, 8) : integer(3, 6);
    const trapCount = hard ? integer(3, 6) : integer(1, 3);
    const wolfCount = hard ? integer(2, 3) : integer(1, 2);
    const minDepth = hard ? 5 + Math.floor((levelNumber - 31) / 7) : levelNumber >= 21 ? 4 : 2;
    const maxDepth = hard ? 13 : 10;
    let accepted = null;
    let solution = null;
    for (let attempt = 0; attempt < 700; attempt += 1) {
        const candidate = createCandidate(levelNumber, rows, cols, sheepCount, obstacleCount, trapCount, wolfCount, levelNumber % 3 !== 0);
        const candidateSolution = solve(candidate, maxDepth);
        if (candidateSolution && candidateSolution.length >= minDepth) {
            accepted = candidate;
            solution = candidateSolution;
            break;
        }
    }
    if (!accepted) throw new Error(`Unable to generate solvable level ${levelNumber}`);
    accepted.title = titles[levelNumber - 11];
    generated.push(accepted);
    solutions.push({ level: levelNumber, steps: solution.length, solution: solution.join(',') });
}

const guides = [
    { level: 1, lines: ['娃娃，这是你要护送的小羊。', '滑动屏幕时，小羊会一直前进，直到碰到边界、障碍、陷阱或羊村。', '地图另一端是羊村，也是小羊的安全终点。', '小羊进入羊村后会离开地图并计入进度；达到目标数量即可过关。'], highlight: { row: 0, col: 0 } },
    { level: 2, lines: ['小羊不会自动转弯。', '利用地图边界停住小羊，再从另一个方向滑动。'], highlight: { row: 1, col: 0 } },
    { level: 3, lines: ['这是固定障碍。', '小羊和野狼都不能穿过它，可以利用障碍改变停靠位置。'], highlight: { row: 2, col: 1 } },
    { level: 4, lines: ['这是陷阱。', '小羊或野狼落入陷阱后都会消失，陷阱也会被消耗。'], highlight: { row: 3, col: 3 } },
    { level: 5, lines: ['这是野狼。', '野狼会随滑动方向移动；移动结束后，如果与小羊相邻，就会吃掉一只小羊。', '野狼不能进入羊村，但可以被引入陷阱。'], highlight: { row: 1, col: 4 } },
    { level: 8, lines: ['本关的障碍可以移动。', '它们会和小羊、野狼一起滑动，但不能进入羊村或陷阱。', '注意障碍移动后可能封路，也可能成为新的落脚点。'], highlight: { row: 0, col: 2 } },
    { level: 21, lines: ['地图已经超过六乘六，主视野只显示其中一部分。', '右上角小地图会标记小羊、野狼、羊村和当前视野。', '拖动小地图可以查看远处；下一次滑动后视野会重新跟随移动的小羊。'], highlight: { row: 0, col: 0 } },
];

fs.writeFileSync(levelFile, `${JSON.stringify({ levels: [...original, ...generated] }, null, 2)}\n`);
fs.writeFileSync(guideFile, `${JSON.stringify({ guides }, null, 2)}\n`);
console.log(JSON.stringify(solutions));
