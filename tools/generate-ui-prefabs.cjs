const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const uiDir = path.join(root, 'assets', 'resources', 'ui');
const artDir = path.join(root, 'assets', 'resources', 'art');

function spriteUuid(file) {
    const meta = JSON.parse(fs.readFileSync(path.join(artDir, `${file}.png.meta`), 'utf8'));
    return meta.subMetas.f9941.uuid;
}

const art = Object.fromEntries([
    'main-bg', 'map-down-bg', 'cloud-panel', 'hero-main', 'guide-grandpa',
    'button-home', 'button-last', 'button-next', 'button-setting', 'button-start',
    'river-tile', 'sheep', 'sheep-2', 'sheep-3', 'sheep-4', 'sheep-5', 'village',
    'button-replay', 'button-undo',
    'ui-panel-gold', 'ui-panel-green', 'ui-button-gold', 'ui-button-green',
    'ui-status-gold', 'ui-status-green', 'ui-bar-dark', 'ui-dialog', 'ui-modal', 'ui-overlay',
].map((name) => [name, spriteUuid(name)]));

function buildPrefab(name, descriptors) {
    let fileIdIndex = 0;
    const nextFileId = () => crypto
        .createHash('sha1')
        .update(`${name}:${fileIdIndex += 1}`)
        .digest('base64')
        .slice(0, 22);
    const data = [{
        __type__: 'cc.Prefab', _name: name, _objFlags: 0, __editorExtras__: {},
        _native: '', data: { __id__: 1 }, optimizationPolicy: 0, persistent: false,
    }];

    function attachComponentPrefabInfo(component) {
        const infoId = data.length;
        component.__prefab = { __id__: infoId };
        data.push({ __type__: 'cc.CompPrefabInfo', fileId: nextFileId() });
    }

    function addNode(descriptor, parentId, isRoot = false) {
        const nodeId = data.length;
        data.push(null);
        const childIds = [];
        const componentIds = [];
        const node = {
            __type__: 'cc.Node', _name: descriptor.name, _objFlags: 0, __editorExtras__: {},
            _parent: isRoot ? null : { __id__: parentId }, _children: childIds,
            _active: descriptor.active !== false, _components: componentIds,
            _prefab: null,
            _lpos: { __type__: 'cc.Vec3', x: descriptor.x ?? 0, y: descriptor.y ?? 0, z: 0 },
            _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
            _lscale: { __type__: 'cc.Vec3', x: descriptor.scale ?? 1, y: descriptor.scale ?? 1, z: 1 },
            _mobility: 0,
            _layer: 33554432,
            _euler: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 }, _id: '',
        };
        data[nodeId] = node;

        const transformId = data.length;
        componentIds.push({ __id__: transformId });
        const transform = {
            __type__: 'cc.UITransform', _name: '', _objFlags: 0, __editorExtras__: {}, node: { __id__: nodeId },
            _enabled: true, _priority: 0,
            _contentSize: { __type__: 'cc.Size', width: descriptor.width ?? 430, height: descriptor.height ?? 760 },
            _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 }, _id: '', __prefab: null,
        };
        data.push(transform);
        attachComponentPrefabInfo(transform);

        if (descriptor.sprite) {
            const spriteId = data.length;
            componentIds.push({ __id__: spriteId });
            const spriteComponent = {
                __type__: 'cc.Sprite', _name: '', _objFlags: 0, __editorExtras__: {}, node: { __id__: nodeId }, _enabled: true,
                __prefab: null, _customMaterial: null,
                _srcBlendFactor: 2, _dstBlendFactor: 4,
                _color: { __type__: 'cc.Color', ...(descriptor.color ?? { r: 255, g: 255, b: 255, a: 255 }) },
                _spriteFrame: { __uuid__: art[descriptor.sprite], __expectedType__: 'cc.SpriteFrame' },
                _type: descriptor.sprite.startsWith('ui-') ? 1 : 0, _fillType: 0, _sizeMode: 0,
                _fillCenter: { __type__: 'cc.Vec2', x: 0, y: 0 }, _fillStart: 0, _fillRange: 0,
                _isTrimmedMode: true, _useGrayscale: false, _atlas: null, _id: '',
            };
            data.push(spriteComponent);
            attachComponentPrefabInfo(spriteComponent);
        }

        if (descriptor.text !== undefined) {
            const labelId = data.length;
            componentIds.push({ __id__: labelId });
            const labelComponent = {
                __type__: 'cc.Label', _name: '', _objFlags: 0, __editorExtras__: {}, node: { __id__: nodeId }, _enabled: true,
                __prefab: null, _customMaterial: null,
                _srcBlendFactor: 2, _dstBlendFactor: 4,
                _color: { __type__: 'cc.Color', ...(descriptor.textColor ?? { r: 255, g: 246, b: 216, a: 255 }) },
                _useOriginalSize: false, _string: descriptor.text,
                _horizontalAlign: 1, _verticalAlign: 1, _actualFontSize: descriptor.fontSize ?? 18,
                _fontSize: descriptor.fontSize ?? 18, _fontFamily: 'Microsoft YaHei',
                _lineHeight: descriptor.lineHeight ?? (descriptor.fontSize ?? 18) + 4,
                _overflow: 2, _enableWrapText: true, _font: null, _isSystemFontUsed: true,
                _isItalic: false, _isBold: descriptor.bold ?? false, _isUnderline: false, _cacheMode: 0,
                _id: '',
            };
            data.push(labelComponent);
            attachComponentPrefabInfo(labelComponent);
        }

        for (const child of descriptor.children ?? []) {
            const childId = addNode(child, nodeId);
            childIds.push({ __id__: childId });
        }
        const prefabInfoId = data.length;
        node._prefab = { __id__: prefabInfoId };
        data.push({
            __type__: 'cc.PrefabInfo', root: { __id__: 1 }, asset: { __id__: 0 }, fileId: nextFileId(),
            instance: null, targetOverrides: null, nestedPrefabInstanceRoots: null,
        });
        return nodeId;
    }

    const rootDescriptor = {
        name,
        width: 1080,
        height: 1920,
        children: [{ name: 'PrefabContent', width: 430, height: 760, scale: 1080 / 430, children: descriptors }],
    };
    addNode(rootDescriptor, null, true);
    fs.writeFileSync(path.join(uiDir, `${name}.prefab`), `${JSON.stringify(data, null, 2)}\n`);
}

const label = (name, text, width, height, x, y, fontSize = 18, extra = {}) =>
    ({ name, text, width, height, x, y, fontSize, ...extra });
const sprite = (name, image, width, height, x = 0, y = 0, extra = {}) =>
    ({ name, sprite: image, width, height, x, y, ...extra });

buildPrefab('UIMain', [
    sprite('Background', 'main-bg', 430, 760),
    { name: 'TopContainer', width: 430, height: 170, x: 0, y: 245, children: [
        label('Title', '狼来了', 370, 90, 0, 25, 64, { bold: true, textColor: { r: 255, g: 247, b: 211, a: 255 } }),
        label('Subtitle', '小羊快跑', 220, 38, 0, -25, 22, { bold: true }),
    ] },
    { name: 'MiddleContainer', width: 430, height: 330, x: 0, y: 42, children: [
        sprite('Hero', 'hero-main', 330, 310),
    ] },
    { name: 'BottomContainer', width: 430, height: 180, x: 0, y: -265, children: [
        { name: 'StartButton', sprite: 'ui-button-green', text: '点击任意位置开始', width: 320, height: 86, x: 0, y: 45, fontSize: 25, bold: true },
        { name: 'EditorButton', sprite: 'ui-button-green', text: '关卡编辑', width: 150, height: 44, x: 0, y: -40, fontSize: 17, bold: true },
    ] },
]);

buildPrefab('UIGame', [
    sprite('Background', 'main-bg', 430, 760),
    { name: 'TopContainer', width: 430, height: 110, x: 0, y: 310, children: [
        sprite('TopPanel', 'ui-panel-gold', 390, 58, 0, 20),
        sprite('HomeButton', 'button-home', 38, 40, -170, 20),
        sprite('PreviousButton', 'button-last', 78, 38, -42, 20),
        sprite('NextButton', 'button-next', 78, 38, 46, 20),
        sprite('SettingButton', 'button-setting', 38, 40, 170, 20, { active: false }),
        sprite('ReplayButton', 'button-replay', 38, 40, 170, 20),
        sprite('UndoButton', 'button-undo', 70, 40, 88, 20, { active: false }),
        { name: 'SeasonBar', sprite: 'ui-bar-dark', width: 390, height: 34, x: 0, y: -24 },
        label('LevelNumber', '第 1 关', 120, 30, -130, -24, 17, { bold: true }),
        label('LevelTitle', '初次护送', 180, 30, 100, -24, 17, { bold: true }),
    ] },
    { name: 'MiddleContainer', width: 430, height: 500, x: 0, y: 12, children: [
        { name: 'BoardHost', width: 392, height: 500 },
    ] },
    { name: 'BottomContainer', width: 430, height: 110, x: 0, y: -320, children: [
        { name: 'SheepStatus', sprite: 'ui-status-gold', text: '小羊\n1', width: 120, height: 50, x: -135, y: 28, fontSize: 16, bold: true, textColor: { r: 78, g: 52, b: 23, a: 255 } },
        { name: 'GoalStatus', sprite: 'ui-status-green', text: '进度\n0/1', width: 120, height: 50, x: 0, y: 28, fontSize: 16, bold: true },
        { name: 'WolfStatus', sprite: 'ui-status-gold', text: '野狼\n0', width: 120, height: 50, x: 135, y: 28, fontSize: 16, bold: true, textColor: { r: 78, g: 52, b: 23, a: 255 } },
        { name: 'MessageBar', sprite: 'ui-bar-dark', text: '滑动屏幕，护送小羊逃进羊村', width: 380, height: 38, x: 0, y: -25, fontSize: 15, bold: true },
    ] },
    { name: 'ResultModal', width: 430, height: 760, active: false, children: [
        sprite('ModalShade', 'ui-overlay', 430, 760),
        { name: 'ModalPanel', sprite: 'ui-modal', width: 330, height: 270, children: [
            sprite('ModalHero', 'hero-main', 112, 112, 0, 74),
            label('ModalTitle', '逃跑成功', 290, 40, 0, 16, 27, { bold: true, textColor: { r: 61, g: 42, b: 21, a: 255 } }),
            label('ModalMessage', '小羊成功逃脱。', 284, 66, 0, -34, 16, { textColor: { r: 94, g: 64, b: 29, a: 255 } }),
            sprite('ModalHome', 'button-home', 48, 50, -80, -99),
            sprite('ModalReplay', 'button-replay', 48, 50, -18, -99),
            sprite('ModalNext', 'button-next', 86, 50, 72, -99),
        ] },
    ] },
]);

buildPrefab('UIEditor', [
    sprite('Background', 'main-bg', 430, 760),
    { name: 'TopContainer', width: 430, height: 160, x: 0, y: 292, children: [
        sprite('Header', 'ui-panel-gold', 398, 58, 0, 42),
        sprite('HomeButton', 'button-home', 38, 40, -175, 42),
        label('EditorTitle', '编辑关卡\n狼来了', 120, 48, -100, 42, 17, { bold: true, textColor: { r: 76, g: 51, b: 22, a: 255 } }),
        label('GoalValue', '逃离 1', 62, 32, 18, 42, 14, { textColor: { r: 76, g: 51, b: 22, a: 255 } }),
        { name: 'GoalMinus', sprite: 'ui-button-gold', text: '-', width: 28, height: 30, x: 62, y: 42, fontSize: 18, textColor: { r: 76, g: 51, b: 22, a: 255 } },
        { name: 'GoalPlus', sprite: 'ui-button-gold', text: '+', width: 28, height: 30, x: 94, y: 42, fontSize: 18, textColor: { r: 76, g: 51, b: 22, a: 255 } },
        { name: 'MoveObstacleToggle', sprite: 'ui-button-gold', text: '障碍 关', width: 72, height: 32, x: 148, y: 42, fontSize: 13, textColor: { r: 76, g: 51, b: 22, a: 255 } },
        { name: 'SizeBar', sprite: 'ui-bar-dark', width: 398, height: 40, x: 0, y: -14 },
        label('RowsValue', '行 6', 52, 28, -145, -14, 14),
        { name: 'RowsMinus', sprite: 'ui-button-gold', text: '-', width: 28, height: 28, x: -108, y: -14, fontSize: 17, textColor: { r: 76, g: 51, b: 22, a: 255 } },
        { name: 'RowsPlus', sprite: 'ui-button-gold', text: '+', width: 28, height: 28, x: -76, y: -14, fontSize: 17, textColor: { r: 76, g: 51, b: 22, a: 255 } },
        label('ColsValue', '列 6', 52, 28, -26, -14, 14),
        { name: 'ColsMinus', sprite: 'ui-button-gold', text: '-', width: 28, height: 28, x: 10, y: -14, fontSize: 17, textColor: { r: 76, g: 51, b: 22, a: 255 } },
        { name: 'ColsPlus', sprite: 'ui-button-gold', text: '+', width: 28, height: 28, x: 42, y: -14, fontSize: 17, textColor: { r: 76, g: 51, b: 22, a: 255 } },
        { name: 'ResizeMap', sprite: 'ui-button-gold', text: '生成地图', width: 86, height: 30, x: 122, y: -14, fontSize: 14, textColor: { r: 76, g: 51, b: 22, a: 255 } },
        { name: 'ClearButton', sprite: 'ui-button-gold', text: '清空', width: 120, height: 38, x: -135, y: -58, fontSize: 16, textColor: { r: 76, g: 51, b: 22, a: 255 } },
        { name: 'PlayButton', sprite: 'ui-button-gold', text: '试玩', width: 120, height: 38, x: 0, y: -58, fontSize: 16, textColor: { r: 76, g: 51, b: 22, a: 255 } },
        { name: 'SaveButton', sprite: 'ui-button-green', text: '保存', width: 120, height: 38, x: 135, y: -58, fontSize: 16, bold: true },
    ] },
    { name: 'MiddleContainer', width: 430, height: 390, x: 0, y: 16, children: [
        { name: 'BoardHost', width: 398, height: 390 },
    ] },
    { name: 'BottomContainer', width: 430, height: 150, x: 0, y: -288, children: [
        { name: 'EditorTabs', sprite: 'ui-bar-dark', width: 398, height: 34, x: 0, y: 56, children: [
            { name: 'Tab-erase', text: '擦除', width: 58, height: 28, x: -165, fontSize: 13, bold: true },
            { name: 'Tab-sheep', text: '小羊', width: 58, height: 28, x: -99, fontSize: 13, bold: true },
            { name: 'Tab-wolf', text: '狼', width: 58, height: 28, x: -33, fontSize: 13, bold: true },
            { name: 'Tab-village', text: '羊村', width: 58, height: 28, x: 33, fontSize: 13, bold: true },
            { name: 'Tab-obstacle', text: '障碍', width: 58, height: 28, x: 99, fontSize: 13, bold: true },
            { name: 'Tab-trap', text: '陷阱', width: 58, height: 28, x: 165, fontSize: 13, bold: true },
        ] },
        { name: 'Palette', width: 398, height: 62, x: 0, y: 3, children: [0, 1, 2, 3, 4].map((i) => sprite(`Sheep-${i + 1}`, i ? `sheep-${i + 1}` : 'sheep', 42, 42, -120 + i * 60, 0)) },
        { name: 'EditorMessage', sprite: 'ui-bar-dark', text: '选择下方素材，点击地图放置', width: 398, height: 38, x: 0, y: -57, fontSize: 16, bold: true },
    ] },
]);

buildPrefab('UILoading', [
    sprite('Background', 'main-bg', 430, 760),
    { name: 'TopContainer', width: 430, height: 160, x: 0, y: 300 },
    { name: 'MiddleContainer', width: 430, height: 440, children: [
        sprite('LoadingCloud', 'cloud-panel', 430, 220),
        label('LoadingLabel', '加载中...', 220, 48, 0, 0, 22, { bold: true }),
    ] },
    { name: 'BottomContainer', width: 430, height: 160, x: 0, y: -300 },
]);

buildPrefab('UIGuide', [
    sprite('GuideShadeTop', 'ui-overlay', 430, 200, 0, 280),
    sprite('GuideShadeBottom', 'ui-overlay', 430, 200, 0, -280),
    sprite('GuideShadeLeft', 'ui-overlay', 172, 86, -129, 40),
    sprite('GuideShadeRight', 'ui-overlay', 172, 86, 129, 40),
    { name: 'TopContainer', width: 430, height: 160, x: 0, y: 300 },
    { name: 'MiddleContainer', width: 430, height: 440, children: [
        { name: 'Spotlight', width: 86, height: 86, x: 0, y: 40 },
    ] },
    { name: 'BottomContainer', width: 430, height: 180, x: 0, y: -290, children: [
        sprite('GuideDialog', 'ui-dialog', 360, 104, 18, 0),
        sprite('GuideGrandpa', 'guide-grandpa', 100, 150, -135, 20),
        label('GuideText', '跟着提示滑动小羊', 240, 70, 50, 8, 17, { bold: true, textColor: { r: 63, g: 42, b: 20, a: 255 } }),
        label('GuideHint', '点击继续', 74, 18, 135, -36, 11, { textColor: { r: 105, g: 76, b: 38, a: 180 } }),
    ] },
]);
