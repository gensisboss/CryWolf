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

const resourcesRoot = path.join(destination, 'assets', 'resources');
const nativeSource = path.join(resourcesRoot, 'native');
const nativeDestination = path.join(resourcesRoot, 'native-assets');
const resourcesConfigPath = path.join(resourcesRoot, 'config.json');
if (fs.existsSync(nativeSource)) {
    fs.renameSync(nativeSource, nativeDestination);
    const resourcesConfig = JSON.parse(fs.readFileSync(resourcesConfigPath, 'utf8'));
    resourcesConfig.nativeBase = 'native-assets';
    fs.writeFileSync(resourcesConfigPath, JSON.stringify(resourcesConfig));
}

fs.writeFileSync(path.join(destination, '.nojekyll'), '');
fs.writeFileSync(path.join(destination, 'CNAME'), 'game.gongganghao.com\n');
console.log(`Published ${source} to ${destination}`);
