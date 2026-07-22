const fs = require('node:fs');
const path = require('node:path');

const levelsPath = path.join(__dirname, '..', 'assets', 'resources', 'data', 'levels.json');
const campaign = JSON.parse(fs.readFileSync(levelsPath, 'utf8'));

const upgradedGoals = new Map([
    [13, 2], [14, 2], [16, 2], [18, 2], [19, 2], [20, 2],
    [21, 3], [23, 2], [24, 3], [26, 2], [29, 2],
    [32, 3], [35, 3], [37, 3], [43, 3], [44, 3], [49, 3],
]);

for (const [levelNumber, goal] of upgradedGoals) {
    campaign.levels[levelNumber - 1].goal = goal;
}

fs.writeFileSync(levelsPath, `${JSON.stringify(campaign, null, 2)}\n`);
