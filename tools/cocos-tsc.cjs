const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const candidates = [
    path.join(__dirname, '..', 'node_modules', 'typescript', 'bin', 'tsc'),
    'C:/ProgramData/cocos/editors/Creator/3.8.4/resources/resources/3d/engine/node_modules/typescript/bin/tsc',
    'C:/ProgramData/cocos/editors/Creator/3.8.4/resources/app.asar.unpacked/node_modules/typescript/bin/tsc',
];
const compiler = candidates.find(fs.existsSync);

if (!compiler) {
    console.error('TypeScript compiler not found. Open this project once in Cocos Creator 3.8.4 or install TypeScript locally.');
    process.exit(1);
}

const result = spawnSync(process.execPath, [compiler, ...process.argv.slice(2)], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
});
process.exit(result.status ?? 1);
