const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');

function cocosClassId(uuid) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const hex = uuid.replace(/-/g, '');
    let value = hex.slice(0, 5);
    for (let index = 5; index < 32; index += 3) {
        const group = Number.parseInt(hex.slice(index, index + 3), 16);
        value += alphabet[group >> 6] + alphabet[group & 63];
    }
    return value;
}

test('project declares the installed Cocos Creator 3.8.4 version', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    assert.equal(manifest.creator.version, '3.8.4');
});

test('Main scene owns a live GameApp component with the imported script class id', () => {
    const scriptMeta = JSON.parse(fs.readFileSync(
        path.join(projectRoot, 'assets', 'game', 'scripts', 'ui', 'GameApp.ts.meta'),
        'utf8',
    ));
    const scene = JSON.parse(fs.readFileSync(
        path.join(projectRoot, 'assets', 'scenes', 'Main.scene'),
        'utf8',
    ));
    const sceneMeta = JSON.parse(fs.readFileSync(
        path.join(projectRoot, 'assets', 'scenes', 'Main.scene.meta'),
        'utf8',
    ));
    const classId = cocosClassId(scriptMeta.uuid);
    const componentIndex = scene.findIndex((item) => item.__type__ === classId);

    assert.ok(componentIndex > 0, 'GameApp component should be serialized into Main.scene');
    assert.ok(scene[2]._components.some((reference) => reference.__id__ === componentIndex));
    assert.equal(scene[1]._id, sceneMeta.uuid);
});

test('project uses a 1080 x 1920 adaptive portrait design resolution', () => {
    const gameApp = fs.readFileSync(
        path.join(projectRoot, 'assets', 'game', 'scripts', 'ui', 'GameApp.ts'),
        'utf8',
    );
    const scene = JSON.parse(fs.readFileSync(
        path.join(projectRoot, 'assets', 'scenes', 'Main.scene'),
        'utf8',
    ));
    const canvasTransform = scene.find((item) => item.__type__ === 'cc.UITransform' && item.node?.__id__ === 2);

    assert.match(gameApp, /const DESIGN_WIDTH = 1080;/);
    assert.match(gameApp, /const DESIGN_HEIGHT = 1920;/);
    assert.match(gameApp, /view\.on\('canvas-resize'/);
    assert.equal(canvasTransform._contentSize.width, 1080);
    assert.equal(canvasTransform._contentSize.height, 1920);
});

test('all runtime JSON and art resources were imported into the resources bundle', () => {
    const artDirectory = path.join(projectRoot, 'assets', 'resources', 'art');
    const pngFiles = fs.readdirSync(artDirectory).filter((name) => name.endsWith('.png'));
    assert.equal(pngFiles.length, 45);
    assert.ok(pngFiles.includes('button-undo.png'));
    ['ui-panel-gold', 'ui-panel-green', 'ui-button-gold', 'ui-button-green', 'ui-status-gold', 'ui-status-green', 'ui-bar-dark', 'ui-dialog', 'ui-modal', 'ui-overlay'].forEach((name) => {
        assert.ok(pngFiles.includes(`${name}.png`), `${name} should have a dedicated bitmap asset`);
    });
    pngFiles.forEach((name) => {
        assert.ok(fs.existsSync(path.join(artDirectory, `${name}.meta`)), `${name} should have Cocos metadata`);
    });
    ['levels.json', 'guides.json'].forEach((name) => {
        const file = path.join(projectRoot, 'assets', 'resources', 'data', name);
        assert.ok(fs.existsSync(file));
        assert.ok(fs.existsSync(`${file}.meta`));
    });
});

test('generated audio effects are valid imported PCM wave resources', () => {
    const audioDirectory = path.join(projectRoot, 'assets', 'resources', 'audio');
    const expected = ['click', 'slide', 'escape', 'wolf', 'eat', 'death', 'trap', 'win', 'lose', 'transition', 'undo', 'guide', 'bgm'];
    expected.forEach((name) => {
        const wavPath = path.join(audioDirectory, `${name}.wav`);
        const wav = fs.readFileSync(wavPath);
        const meta = JSON.parse(fs.readFileSync(`${wavPath}.meta`, 'utf8'));
        assert.equal(wav.subarray(0, 4).toString('ascii'), 'RIFF');
        assert.equal(wav.subarray(8, 12).toString('ascii'), 'WAVE');
        assert.ok(wav.length > 1000);
        assert.equal(meta.importer, 'audio-clip');
    });
});

test('editor clears any occupied tile without an eraser tool or full board rebuild', () => {
    const gameApp = fs.readFileSync(path.join(projectRoot, 'assets', 'game', 'scripts', 'ui', 'GameApp.ts'), 'utf8');
    const boardView = fs.readFileSync(path.join(projectRoot, 'assets', 'game', 'scripts', 'presentation', 'BoardView.ts'), 'utf8');
    const editorPrefab = JSON.parse(fs.readFileSync(path.join(projectRoot, 'assets', 'resources', 'ui', 'UIEditor.prefab'), 'utf8'));
    assert.doesNotMatch(gameApp, /key:\s*'erase'/);
    assert.match(gameApp, /const nextId = current === 0 \? this\.selectedEditorId : 0/);
    assert.match(gameApp, /this\.board\?\.updateEditorCell\(row, col, nextId, state\)/);
    assert.match(boardView, /public updateEditorCell\(/);
    const eraseTab = editorPrefab.find((entry) => entry?._name === 'Tab-erase');
    assert.equal(eraseTab?._active, false);
});

test('editor tool switching preserves the board instance and only refreshes the palette', () => {
    const gameApp = fs.readFileSync(path.join(projectRoot, 'assets', 'game', 'scripts', 'ui', 'GameApp.ts'), 'utf8');
    const tabBinding = gameApp.match(/EDITOR_GROUPS\.forEach\(\(group\) => \{([\s\S]*?)\n        \}\);/)?.[1] ?? '';
    const paletteBinding = gameApp.match(/private buildEditorPalette\(parent: Node\): void \{([\s\S]*?)\n    \}/)?.[1] ?? '';
    assert.match(tabBinding, /this\.scheduleEditorPaletteRefresh\(bottom\)/);
    assert.doesNotMatch(tabBinding, /this\.showEditorScreen\(\)/);
    assert.match(paletteBinding, /this\.scheduleEditorPaletteRefresh\(/);
    assert.doesNotMatch(paletteBinding, /this\.showEditorScreen\(\)/);
});

test('editor node replacement is deferred until after touch event dispatch', () => {
    const gameApp = fs.readFileSync(path.join(projectRoot, 'assets', 'game', 'scripts', 'ui', 'GameApp.ts'), 'utf8');
    assert.match(gameApp, /private scheduleEditorPaletteRefresh\(bottom: Node\): void[\s\S]*this\.scheduleOnce\(\(\) =>/);
    assert.match(gameApp, /private scheduleEditorScreenRefresh\(\): void[\s\S]*this\.scheduleOnce\(\(\) =>/);
    assert.match(gameApp, /private changeEditorSize[\s\S]*this\.scheduleEditorScreenRefresh\(\)/);
    assert.match(gameApp, /private changeEditorGoal[\s\S]*this\.scheduleEditorScreenRefresh\(\)/);
});

test('board uses its full-map base without generating an extra viewport background', () => {
    const boardView = fs.readFileSync(path.join(projectRoot, 'assets', 'game', 'scripts', 'presentation', 'BoardView.ts'), 'utf8');
    const assetCatalog = fs.readFileSync(path.join(projectRoot, 'assets', 'game', 'scripts', 'presentation', 'AssetCatalog.ts'), 'utf8');
    assert.match(boardView, /createPanel\(boardPanel, 'MapBase', mapWidth, mapHeight/);
    assert.doesNotMatch(boardView, /MapBackground|assets\.get\('mapBackground'\)/);
    assert.doesNotMatch(assetCatalog, /mapBackground:\s*'map-down-bg'/);
});

test('editor playtest preserves the campaign level and clears playtest state on home', () => {
    const gameApp = fs.readFileSync(path.join(projectRoot, 'assets', 'game', 'scripts', 'ui', 'GameApp.ts'), 'utf8');
    const playtestMethod = gameApp.match(/private async playEditorLevel\(\): Promise<void> \{([\s\S]*?)\n    \}/)?.[1] ?? '';
    assert.doesNotMatch(playtestMethod, /this\.currentLevel\s*=/);
    assert.match(playtestMethod, /transitionToLevel\(this\.currentLevel\)/);
    const homeMethod = gameApp.match(/private goHome\(\): void \{([\s\S]*?)\n    \}/)?.[1] ?? '';
    assert.match(homeMethod, /this\.progressTracking = true/);
    assert.match(homeMethod, /this\.playtestLevel = null/);
    assert.match(homeMethod, /this\.currentLevel = this\.resumeLevelIndex\(\)/);
    assert.match(homeMethod, /createInitialState\(this\.levels\[this\.currentLevel\]\)/);
});

test('campaign resumes from the highest completed level and persists completion count', () => {
    const gameApp = fs.readFileSync(path.join(projectRoot, 'assets', 'game', 'scripts', 'ui', 'GameApp.ts'), 'utf8');
    const progressStore = fs.readFileSync(path.join(projectRoot, 'assets', 'game', 'scripts', 'storage', 'ProgressStore.ts'), 'utf8');
    assert.match(progressStore, /loadMaxCompletedLevels\(\)/);
    assert.match(progressStore, /saveMaxCompletedLevels\(count: number\)/);
    assert.match(progressStore, /return this\.loadMaxUnlockedLevel\(\)/);
    assert.match(gameApp, /this\.maxCompletedLevels = Math\.min\(this\.store\.loadMaxCompletedLevels\(\), this\.levels\.length\)/);
    assert.match(gameApp, /private resumeLevelIndex\(\): number/);
    assert.match(gameApp, /this\.currentLevel = this\.resumeLevelIndex\(\)/);
    assert.match(gameApp, /this\.store\.saveMaxCompletedLevels\(this\.maxCompletedLevels\)/);
});

test('previous and undo buttons share next button canvas and SpriteFrame geometry', () => {
    const artDirectory = path.join(projectRoot, 'assets', 'resources', 'art');
    const read = (name) => {
        const png = fs.readFileSync(path.join(artDirectory, `${name}.png`));
        const meta = JSON.parse(fs.readFileSync(path.join(artDirectory, `${name}.png.meta`), 'utf8'));
        const geometry = structuredClone(meta.subMetas.f9941.userData);
        delete geometry.imageUuidOrDatabaseUri;
        delete geometry.atlasUuid;
        return { width: png.readUInt32BE(16), height: png.readUInt32BE(20), geometry };
    };
    const next = read('button-next');
    ['button-last', 'button-undo'].forEach((name) => {
        const candidate = read(name);
        assert.equal(candidate.width, next.width);
        assert.equal(candidate.height, next.height);
        assert.deepEqual(candidate.geometry, next.geometry);
    });
});

test('all runtime UI screens are loadable Cocos prefabs', () => {
    const uiDirectory = path.join(projectRoot, 'assets', 'resources', 'ui');
    const expected = ['UIMain', 'UIGame', 'UIGuide', 'UIEditor'];
    const gameApp = fs.readFileSync(
        path.join(projectRoot, 'assets', 'game', 'scripts', 'ui', 'GameApp.ts'),
        'utf8',
    );

    expected.forEach((name) => {
        const prefabPath = path.join(uiDirectory, `${name}.prefab`);
        const prefab = JSON.parse(fs.readFileSync(prefabPath, 'utf8'));
        const meta = JSON.parse(fs.readFileSync(`${prefabPath}.meta`, 'utf8'));
        assert.equal(prefab[0].__type__, 'cc.Prefab');
        assert.equal(prefab[0]._name, name);
        assert.equal(prefab[1]._name, name);
        const rootTransform = prefab.find((item) => item.__type__ === 'cc.UITransform' && item.node?.__id__ === 1);
        assert.equal(rootTransform._contentSize.width, 1080);
        assert.equal(rootTransform._contentSize.height, 1920);
        const previewRoot = prefab.find((item) => item.__type__ === 'cc.Node' && item._name === 'PrefabContent');
        assert.ok(previewRoot, `${name} should contain an editable visual hierarchy`);
        assert.ok(previewRoot._children.length > 1, `${name} should not be an empty shell`);
        assert.equal(meta.importer, 'prefab');
    });
});

test('Main scene owns runtime UI prefabs and scene-level presentation nodes', () => {
    const scene = JSON.parse(fs.readFileSync(
        path.join(projectRoot, 'assets', 'scenes', 'Main.scene'),
        'utf8',
    ));
    const serialized = JSON.stringify(scene);
    const manager = fs.readFileSync(
        path.join(projectRoot, 'assets', 'game', 'scripts', 'ui', 'UiScreenManager.ts'),
        'utf8',
    );
    const gameApp = fs.readFileSync(
        path.join(projectRoot, 'assets', 'game', 'scripts', 'ui', 'GameApp.ts'),
        'utf8',
    );
    ['101', '102', '104', '105'].forEach((suffix) => {
        assert.match(serialized, new RegExp(`7445eaf4-7ad4-4e42-8ec2-1f10d494d${suffix}`));
    });
    assert.doesNotMatch(serialized, /7445eaf4-7ad4-4e42-8ec2-1f10d494d103/);
    const canvas = scene.find((item) => item.__type__ === 'cc.Node' && item._name === 'Canvas');
    const childNames = canvas._children.map((child) => scene[child.__id__]._name);
    assert.equal(childNames[0], 'Background');
    assert.equal(childNames.at(-1), 'TransitionCloud');
    assert.match(manager, /showPrefab\(prefab: Prefab/);
    assert.match(gameApp, /showScreenPrefab\(this\.uiGamePrefab, 'UIGame'\)/);
});

test('loading transition is globally callable with queued async operations', () => {
    const transition = fs.readFileSync(
        path.join(projectRoot, 'assets', 'game', 'scripts', 'ui', 'LoadingTransition.ts'),
        'utf8',
    );
    const gameApp = fs.readFileSync(
        path.join(projectRoot, 'assets', 'game', 'scripts', 'ui', 'GameApp.ts'),
        'utf8',
    );
    assert.match(transition, /public static run<T>\(operation: AsyncLoadingOperation<T>\): Promise<T>/);
    assert.match(transition, /this\.queue\.then\(\(\) => this\.execute\(operation\)\)/);
    assert.match(transition, /return await operation\(\)/);
    assert.match(gameApp, /LoadingTransition\.configure\(this\.transitionCloud, this\.node/);
    assert.ok((gameApp.match(/LoadingTransition\.run\(async \(\) =>/g) ?? []).length >= 2);
});

test('every level entry uses the cloud transition and only fixed obstacles have a cell background', () => {
    const gameApp = fs.readFileSync(
        path.join(projectRoot, 'assets', 'game', 'scripts', 'ui', 'GameApp.ts'),
        'utf8',
    );
    const boardView = fs.readFileSync(
        path.join(projectRoot, 'assets', 'game', 'scripts', 'presentation', 'BoardView.ts'),
        'utf8',
    );
    assert.match(gameApp, /private async resetLevel\(\): Promise<void>[\s\S]*await this\.transitionToLevel\(this\.currentLevel\)/);
    assert.match(gameApp, /private async startMainGame\(\): Promise<void>[\s\S]*await this\.transitionToLevel\(this\.currentLevel\)/);
    assert.match(gameApp, /private async playEditorLevel\(\): Promise<void>[\s\S]*await this\.transitionToLevel\(this\.currentLevel\)/);
    assert.match(boardView, /kind === 'obstacle' && moveObstacle === 0/);
    assert.match(boardView, /obstacle\?\.id \?\? trap\?\.id \?\? village\?\.id \?\? 0/);
    assert.doesNotMatch(boardView, /const tileId = state\.level\.map\[row\]\?\.\[col\] \?\? 0/);
});

test('screen switches immediately deactivate the previous UI before deferred destruction', () => {
    const manager = fs.readFileSync(
        path.join(projectRoot, 'assets', 'game', 'scripts', 'ui', 'UiScreenManager.ts'),
        'utf8',
    );
    assert.match(manager, /this\.current\.active = false;\s*this\.current\.destroy\(\);/);
});

test('legacy runtime-built screens and their dynamic screen entry point are removed', () => {
    const gameApp = fs.readFileSync(path.join(projectRoot, 'assets', 'game', 'scripts', 'ui', 'GameApp.ts'), 'utf8');
    const screenManager = fs.readFileSync(path.join(projectRoot, 'assets', 'game', 'scripts', 'ui', 'UiScreenManager.ts'), 'utf8');
    assert.doesNotMatch(gameApp, /buildGameScreenLegacy|showResultModalLegacy|showEditorScreenLegacy|createStatusBox|beginScreen/);
    assert.doesNotMatch(screenManager, /public show\(/);
    assert.doesNotMatch(screenManager, /createUiNode/);
});

test('game and editor prefabs leave generated board scenes empty', () => {
    ['UIGame', 'UIEditor'].forEach((name) => {
        const prefab = JSON.parse(fs.readFileSync(
            path.join(projectRoot, 'assets', 'resources', 'ui', `${name}.prefab`),
            'utf8',
        ));
        const boardHost = prefab.find((item) => item.__type__ === 'cc.Node' && item._name === 'BoardHost');
        assert.ok(boardHost, `${name} should expose a BoardHost for runtime content`);
        assert.deepEqual(boardHost._children, [], `${name} must not serialize example board cells`);
        assert.equal(
            prefab.some((item) => item.__type__ === 'cc.Node' && item._name === 'BoardBackground'),
            false,
            `${name} board background belongs to the generated scene`,
        );
    });
});

test('UI prefabs group layout into top, middle, and bottom containers', () => {
    ['UIMain', 'UIGame', 'UIGuide', 'UIEditor'].forEach((name) => {
        const prefab = JSON.parse(fs.readFileSync(
            path.join(projectRoot, 'assets', 'resources', 'ui', `${name}.prefab`),
            'utf8',
        ));
        const nodes = prefab
            .map((item, id) => ({ item, id }))
            .filter(({ item }) => item.__type__ === 'cc.Node');
        const containers = ['TopContainer', 'MiddleContainer', 'BottomContainer']
            .map((containerName) => nodes.find(({ item }) => item._name === containerName));

        containers.forEach((container, index) => {
            assert.ok(container, `${name} should contain ${['top', 'middle', 'bottom'][index]} layout group`);
        });
        const boardHost = nodes.find(({ item }) => item._name === 'BoardHost');
        if (boardHost) {
            assert.equal(boardHost.item._parent.__id__, containers[1].id, `${name} BoardHost should belong to MiddleContainer`);
        }
    });
});

test('every serialized UI node and component has native prefab metadata', () => {
    ['UIMain', 'UIGame', 'UIGuide', 'UIEditor'].forEach((name) => {
        const prefab = JSON.parse(fs.readFileSync(
            path.join(projectRoot, 'assets', 'resources', 'ui', `${name}.prefab`),
            'utf8',
        ));
        prefab.forEach((item, id) => {
            if (item.__type__ === 'cc.Node') {
                assert.equal(prefab[item._prefab?.__id__]?.__type__, 'cc.PrefabInfo', `${name} node ${id} is missing PrefabInfo`);
            } else if (['cc.UITransform', 'cc.Sprite', 'cc.Label'].includes(item.__type__)) {
                assert.equal(prefab[item.__prefab?.__id__]?.__type__, 'cc.CompPrefabInfo', `${name} component ${id} is missing CompPrefabInfo`);
            }
        });
    });
});

test('prefab nodes never mix sprite and label rendering components', () => {
    for (const prefabName of ['UIMain', 'UIGame', 'UIGuide', 'UIEditor']) {
        const prefab = JSON.parse(fs.readFileSync(
            path.join(projectRoot, 'assets', 'resources', 'ui', `${prefabName}.prefab`),
            'utf8',
        ));
        for (const item of prefab) {
            if (item.__type__ !== 'cc.Node') continue;
            const componentTypes = item._components.map((component) => prefab[component.__id__]?.__type__);
            assert.ok(
                !(componentTypes.includes('cc.Sprite') && componentTypes.includes('cc.Label')),
                `${prefabName}/${item._name} must use a child Label node`,
            );
        }
    }
});

test('prefab UI panels and commands use dedicated sprite assets', () => {
    const expectedByPrefab = {
        UIMain: ['StartButton', 'EditorButton'],
        UIGame: ['TopPanel', 'SeasonBar', 'SheepStatus', 'GoalStatus', 'WolfStatus', 'MessageBar', 'ModalShade', 'ModalPanel'],
        UIEditor: ['Header', 'SizeBar', 'GoalMinus', 'GoalPlus', 'MoveObstacleToggle', 'ResizeMap', 'ClearButton', 'PlayButton', 'SaveButton', 'EditorTabs', 'EditorMessage'],
        UIGuide: ['GuideShadeTop', 'GuideShadeBottom', 'GuideShadeLeft', 'GuideShadeRight', 'GuideDialog', 'GuideGrandpa'],
    };
    Object.entries(expectedByPrefab).forEach(([name, expectedNodes]) => {
        const prefab = JSON.parse(fs.readFileSync(
            path.join(projectRoot, 'assets', 'resources', 'ui', `${name}.prefab`),
            'utf8',
        ));
        expectedNodes.forEach((nodeName) => {
            const nodeId = prefab.findIndex((item) => item.__type__ === 'cc.Node' && item._name === nodeName);
            const node = prefab[nodeId];
            assert.ok(node, `${name}/${nodeName} should exist`);
            assert.ok(node._components.some((reference) => prefab[reference.__id__]?.__type__ === 'cc.Sprite'), `${name}/${nodeName} should use a Sprite asset`);
        });
    });
});

test('BoardView builds the full bounded map and enables the draggable minimap', () => {
    const boardView = fs.readFileSync(
        path.join(projectRoot, 'assets', 'game', 'scripts', 'presentation', 'BoardView.ts'),
        'utf8',
    );
    const minimap = fs.readFileSync(
        path.join(projectRoot, 'assets', 'game', 'scripts', 'presentation', 'SlideMinimapView.ts'),
        'utf8',
    );
    assert.match(boardView, /row = 0; row < state\.rows/);
    assert.match(boardView, /col = 0; col < state\.cols/);
    assert.doesNotMatch(boardView, /this\.render\(intermediate/);
    assert.match(boardView, /this\.boardPanel\.setPosition\(-this\.visualViewport\.col \* stride/);
    assert.match(boardView, /this\.content\.getComponent\(UITransform\)!\.setContentSize\(boardWidth, boardHeight\)/);
    assert.match(boardView, /this\.border\.setSiblingIndex\(this\.content\.getSiblingIndex\(\) \+ 1\)/);
    assert.match(boardView, /this\.border\.getComponent\(UITransform\)!\.setContentSize\(boardWidth, boardHeight\)/);
    assert.match(boardView, /const mapWidth = state\.cols \* this\.cellSize/);
    assert.match(boardView, /const mapHeight = state\.rows \* this\.cellSize/);
    assert.match(boardView, /createPanel\(boardPanel, 'MapBase', mapWidth, mapHeight, mapCenterX, mapCenterY/);
    assert.match(boardView, /state\.rows > VIEWPORT_SIZE \|\| state\.cols > VIEWPORT_SIZE/);
    assert.match(minimap, /Node\.EventType\.TOUCH_MOVE/);
});

test('board swipe completion handles touches released outside the screen', () => {
    const boardView = fs.readFileSync(
        path.join(projectRoot, 'assets', 'game', 'scripts', 'presentation', 'BoardView.ts'),
        'utf8',
    );
    assert.match(boardView, /const finishSwipe = \(event: EventTouch\): void =>/);
    assert.match(boardView, /TOUCH_END, finishSwipe/);
    assert.match(boardView, /TOUCH_CANCEL, finishSwipe/);
});
