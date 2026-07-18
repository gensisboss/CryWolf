const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = path.join(root, 'build', 'web-mobile');
const destination = path.join(root, 'docs');

if (!fs.existsSync(path.join(source, 'index.html'))) {
    throw new Error('Missing build/web-mobile/index.html. Build web-mobile in Cocos Creator first.');
}

fs.rmSync(destination, { recursive: true, force: true });
fs.cpSync(source, destination, { recursive: true });
fs.writeFileSync(path.join(destination, '.nojekyll'), '');
console.log(`Published ${source} to ${destination}`);
