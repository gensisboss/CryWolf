const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const scenePath = path.join(root, 'assets', 'scenes', 'Main.scene');
const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
const canvasId = scene.findIndex((item) => item?.__type__ === 'cc.Node' && item._name === 'Canvas');
const canvas = scene[canvasId];
const gameApp = scene.find((item) => item?.uiMainPrefab && item?.uiGamePrefab);

if (!canvas || !gameApp) throw new Error('Main.scene is missing Canvas or GameApp');
if (scene.some((item) => item?.__type__ === 'cc.Node' && item._name === 'TransitionCloud')) {
    throw new Error('Main.scene already contains scene presentation nodes');
}

function spriteUuid(name) {
    const metaPath = path.join(root, 'assets', 'resources', 'art', `${name}.png.meta`);
    return JSON.parse(fs.readFileSync(metaPath, 'utf8')).subMetas.f9941.uuid;
}

function addSpriteNode(name, image, width, height, active) {
    const nodeId = scene.length;
    const transformId = nodeId + 1;
    const spriteId = nodeId + 2;
    scene.push({
        __type__: 'cc.Node', _name: name, _objFlags: 0, __editorExtras__: {},
        _parent: { __id__: canvasId }, _children: [], _active: active,
        _components: [{ __id__: transformId }, { __id__: spriteId }], _prefab: null,
        _lpos: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
        _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
        _lscale: { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 }, _mobility: 0,
        _layer: 33554432, _euler: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 }, _id: '',
    });
    scene.push({
        __type__: 'cc.UITransform', _name: '', _objFlags: 0, __editorExtras__: {}, node: { __id__: nodeId },
        _enabled: true, __prefab: null, _contentSize: { __type__: 'cc.Size', width, height },
        _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 }, _id: '',
    });
    scene.push({
        __type__: 'cc.Sprite', _name: '', _objFlags: 0, __editorExtras__: {}, node: { __id__: nodeId },
        _enabled: true, __prefab: null, _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4,
        _color: { __type__: 'cc.Color', r: 255, g: 255, b: 255, a: 255 },
        _spriteFrame: { __uuid__: spriteUuid(image), __expectedType__: 'cc.SpriteFrame' },
        _type: 0, _fillType: 0, _sizeMode: 0, _fillCenter: { __type__: 'cc.Vec2', x: 0, y: 0 },
        _fillStart: 0, _fillRange: 0, _isTrimmedMode: true, _useGrayscale: false, _atlas: null, _id: '',
    });
    return nodeId;
}

const backgroundId = addSpriteNode('Background', 'main-bg', 1080, 1920, true);
const cloudId = addSpriteNode('TransitionCloud', 'cloud-panel', 1080, 560, false);
canvas._children = [
    { __id__: backgroundId },
    ...canvas._children,
    { __id__: cloudId },
];
delete gameApp.uiLoadingPrefab;
gameApp.transitionCloud = { __id__: cloudId };

fs.writeFileSync(scenePath, `${JSON.stringify(scene, null, 2)}\n`);
console.log('Updated Main.scene background and transition cloud');
