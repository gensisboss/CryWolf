import {
    _decorator,
    Button,
    Color,
    Component,
    EventTouch,
    instantiate,
    Label,
    Mask,
    Node,
    Prefab,
    profiler,
    ResolutionPolicy,
    screen,
    tween,
    UITransform,
    UIOpacity,
    Vec3,
    view,
} from 'cc';
import {
    OBSTACLE_IDS,
    SHEEP_IDS,
    TRAP_IDS,
    VILLAGE_IDS,
    WOLF_IDS,
} from '../domain/EntityCatalog';
import { cloneGameState, createInitialState, resolveTurn } from '../domain/GameRules';
import {
    buildLevel,
    clampEditorSize,
    createEmptyMap,
    exportLevelJson,
    placeTile,
    resizeMap,
} from '../domain/LevelEditorRules';
import { Direction, GameState, GuideDefinition, LevelDefinition } from '../domain/GameTypes';
import { GameDataRepository } from '../data/GameDataRepository';
import { AssetCatalog } from '../presentation/AssetCatalog';
import { BoardView } from '../presentation/BoardView';
import { ProgressStore } from '../storage/ProgressStore';
import {
    bindButton,
    createCoverSprite,
    createLabel,
    createPanel,
    createSprite,
    createSpriteButton,
    createTextButton,
    createUiNode,
    drawPanel,
} from './UiFactory';
import { ScreenName, UiScreenManager } from './UiScreenManager';
import { SoundManager } from './SoundManager';

const DESIGN_WIDTH = 1080;
const DESIGN_HEIGHT = 1920;
const LOGICAL_WIDTH = 430;
const LOGICAL_HEIGHT = 760;
const UI_SCALE = Math.min(DESIGN_WIDTH / LOGICAL_WIDTH, DESIGN_HEIGHT / LOGICAL_HEIGHT);

const { ccclass, property } = _decorator;

interface EditorTool {
    label: string;
    id: number;
}

interface EditorGroup {
    key: string;
    label: string;
    tools: EditorTool[];
}

const EDITOR_GROUPS: EditorGroup[] = [
    { key: 'erase', label: '擦除', tools: [{ label: '擦除', id: 0 }] },
    { key: 'sheep', label: '小羊', tools: SHEEP_IDS.slice(0, 5).map((id, index) => ({ label: `羊${index + 1}`, id })) },
    { key: 'wolf', label: '狼', tools: WOLF_IDS.slice(0, 5).map((id, index) => ({ label: `狼${index + 1}`, id })) },
    { key: 'village', label: '羊村', tools: VILLAGE_IDS.slice(0, 4).map((id, index) => ({ label: `羊村${index + 1}`, id })) },
    { key: 'obstacle', label: '障碍', tools: OBSTACLE_IDS.slice(0, 4).map((id, index) => ({ label: `障碍${index + 1}`, id })) },
    { key: 'trap', label: '陷阱', tools: TRAP_IDS.slice(0, 4).map((id, index) => ({ label: `陷阱${index + 1}`, id })) },
];

const DIRECTION_LABELS: Record<Direction, string> = {
    up: '上',
    down: '下',
    left: '左',
    right: '右',
};

@ccclass('GameApp')
export class GameApp extends Component {
    @property(Prefab) private uiMainPrefab: Prefab | null = null;
    @property(Prefab) private uiGamePrefab: Prefab | null = null;
    @property(Prefab) private uiLoadingPrefab: Prefab | null = null;
    @property(Prefab) private uiGuidePrefab: Prefab | null = null;
    @property(Prefab) private uiEditorPrefab: Prefab | null = null;

    private readonly assets = new AssetCatalog();
    private readonly repository = new GameDataRepository();
    private readonly store = new ProgressStore();

    private runtimeRoot!: Node;
    private uiScreens!: UiScreenManager;
    private sounds!: SoundManager;
    private screenRoot: Node | null = null;
    private modalRoot: Node | null = null;
    private guideRoot: Node | null = null;
    private loadingRoot: Node | null = null;
    private screenWidth = 430;
    private screenHeight = 760;
    private frameWidth = 406;
    private frameHeight = 740;

    private levels: LevelDefinition[] = [];
    private guides: GuideDefinition[] = [];
    private currentLevel = 0;
    private maxUnlockedLevel = 0;
    private seenGuideLevels = new Set<number>();
    private state: GameState | null = null;
    private playtestLevel: LevelDefinition | null = null;
    private progressTracking = true;
    private isMoving = false;
    private isTransitioning = false;
    private guideLineIndex = 0;
    private activeGuide: GuideDefinition | null = null;
    private history: GameState[] = [];

    private board: BoardView | null = null;
    private sheepLabel: Label | null = null;
    private wolfLabel: Label | null = null;
    private goalLabel: Label | null = null;
    private messageLabel: Label | null = null;
    private undoButton: Node | null = null;

    private editorRows = 6;
    private editorCols = 6;
    private editorGoal = 1;
    private editorMoveObstacle: 0 | 1 = 0;
    private editorMap = createEmptyMap(6, 6);
    private selectedEditorGroup = 'sheep';
    private selectedEditorId: number = SHEEP_IDS[0];
    private editorMessage = '选择下方素材，点击地图放置';
    private editorMessageLabel: Label | null = null;

    public start(): void {
        void this.boot();
    }

    protected onDestroy(): void {
        view.off('canvas-resize', this.handleCanvasResize, this);
    }

    private async boot(): Promise<void> {
        profiler.hideStats();
        this.updateViewportMetrics();
        this.runtimeRoot = createUiNode(this.node, 'CryWolfRuntime', this.screenWidth, this.screenHeight);
        this.runtimeRoot.setScale(UI_SCALE, UI_SCALE, 1);
        this.uiScreens = new UiScreenManager(this.runtimeRoot);
        this.sounds = new SoundManager(this.node);
        view.on('canvas-resize', this.handleCanvasResize, this);

        try {
            this.showLoadingScreen();
            const [levels, guides] = await Promise.all([
                this.repository.loadLevels(),
                this.repository.loadGuides(),
                this.assets.load(),
                this.sounds.load(),
            ]).then(([loadedLevels, loadedGuides]) => [loadedLevels, loadedGuides] as const);
            this.levels = levels;
            this.guides = guides;
            if (this.levels.length === 0) throw new Error('No playable levels found');

            this.maxUnlockedLevel = Math.min(this.store.loadMaxUnlockedLevel(), this.levels.length - 1);
            this.seenGuideLevels = this.store.loadSeenGuideLevels();
            this.state = createInitialState(this.levels[0]);
            this.loadSavedEditorLevel();
            this.showStartScreen();
        } catch (error) {
            this.showBootError(error instanceof Error ? error.message : String(error));
        }
    }

    private updateViewportMetrics(): void {
        const frameSize = screen.windowSize;
        const resolutionPolicy = frameSize.height >= frameSize.width
            ? ResolutionPolicy.FIXED_WIDTH
            : ResolutionPolicy.SHOW_ALL;
        view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, resolutionPolicy);
        const visible = view.getVisibleSize();
        this.screenWidth = visible.width / UI_SCALE;
        this.screenHeight = visible.height / UI_SCALE;
        this.frameWidth = Math.min(406, this.screenWidth - 20);
        this.frameHeight = Math.min(740, this.screenHeight - 20);
    }

    private handleCanvasResize(): void {
        if (!this.runtimeRoot?.isValid) return;
        const activeScreen = this.uiScreens.currentName;
        this.updateViewportMetrics();
        this.runtimeRoot.getComponent(UITransform)?.setContentSize(this.screenWidth, this.screenHeight);
        this.runtimeRoot.setScale(UI_SCALE, UI_SCALE, 1);
        this.closeModal();
        this.closeGuide(false);
        this.loadingRoot?.destroy();
        this.loadingRoot = null;

        if (activeScreen === 'UIGame' && this.state) {
            this.buildGameScreen();
        } else if (activeScreen === 'UIEditor') {
            this.showEditorScreen();
        } else if (activeScreen === 'UIMain') {
            this.showStartScreen();
        } else {
            this.showLoadingScreen();
        }
    }

    private showLoadingScreen(): void {
        this.showScreenPrefab(this.uiLoadingPrefab, 'UILoading');
    }

    private loadSavedEditorLevel(): void {
        const saved = this.store.loadCustomLevel();
        if (!saved) return;
        this.editorMap = saved.map.map((row) => [...row]);
        this.editorRows = saved.map.length;
        this.editorCols = saved.map[0]?.length ?? 1;
        this.editorGoal = saved.goal;
        this.editorMoveObstacle = saved.moveObstacle;
    }

    private showBootError(detail: string): void {
        this.runtimeRoot.removeAllChildren();
        createPanel(this.runtimeRoot, 'BootErrorBackground', this.screenWidth, this.screenHeight, 0, 0, {
            fill: new Color(60, 86, 53),
        });
        createLabel(
            this.runtimeRoot,
            'BootError',
            `游戏资源加载失败\n${detail}`,
            this.screenWidth - 40,
            160,
            22,
            new Color(255, 246, 216),
        );
    }

    private showScreenPrefab(prefab: Prefab | null, name: string): Node {
        this.closeModal();
        this.closeGuide(false);
        if (!prefab) throw new Error(`Main scene is missing prefab: ${name}`);
        this.screenRoot = this.uiScreens.showPrefab(prefab, this.screenWidth, this.screenHeight);
        this.screenRoot.name = name;
        this.board = null;
        this.undoButton = null;
        return this.requireNode(this.screenRoot, 'PrefabContent');
    }

    private requireNode(root: Node, path: string): Node {
        const node = root.getChildByPath(path);
        if (!node) throw new Error(`Prefab ${root.name} is missing node: ${path}`);
        return node;
    }

    private beginScreen(name: Exclude<ScreenName, 'UILoading'>): Node {
        const prefabs = { UIMain: this.uiMainPrefab, UIGame: this.uiGamePrefab, UIEditor: this.uiEditorPrefab };
        return this.showScreenPrefab(prefabs[name], name);
    }

    private showStartScreen(): void {
        this.progressTracking = true;
        this.playtestLevel = null;
        this.history = [];
        const content = this.showScreenPrefab(this.uiMainPrefab, 'UIMain');
        bindButton(this.requireNode(content, 'BottomContainer/StartButton'), () => {
            this.sounds.play('click', 0.75);
            void this.startMainGame();
        });
        bindButton(this.requireNode(content, 'BottomContainer/EditorButton'), () => {
            this.sounds.play('click', 0.75);
            this.showEditorScreen();
        });
    }

    private async startMainGame(): Promise<void> {
        if (this.isTransitioning || this.levels.length === 0) return;
        this.progressTracking = true;
        this.playtestLevel = null;
        this.currentLevel = Math.min(this.currentLevel, this.levels.length - 1);
        this.state = createInitialState(this.levels[this.currentLevel]);
        this.buildGameScreen();
        await this.transitionToLevel(this.currentLevel);
    }

    private buildGameScreen(): void {
        if (!this.state) return;
        const content = this.showScreenPrefab(this.uiGamePrefab, 'UIGame');
        const top = this.requireNode(content, 'TopContainer');
        const bottom = this.requireNode(content, 'BottomContainer');

        bindButton(this.requireNode(top, 'HomeButton'), () => this.goHome());
        bindButton(this.requireNode(top, 'ReplayButton'), () => this.resetLevel());
        const previous = this.requireNode(top, 'PreviousButton');
        const next = this.requireNode(top, 'NextButton');
        const undo = this.requireNode(top, 'UndoButton');
        this.requireNode(top, 'SettingButton').active = false;
        previous.active = this.progressTracking;
        next.active = this.progressTracking;
        undo.active = !this.progressTracking;
        if (this.progressTracking) {
            bindButton(previous, () => void this.goPreviousLevel());
            bindButton(next, () => void this.goNextLevel());
        } else {
            this.undoButton = undo;
            bindButton(undo, () => void this.undoPlaytestMove());
        }

        this.requireNode(top, 'LevelNumber').getComponent(Label)!.string = this.progressTracking
            ? `第 ${this.currentLevel + 1} 关`
            : '关卡试玩';
        this.requireNode(top, 'LevelTitle').getComponent(Label)!.string = this.state.level.title ?? '自定义关卡';

        const boardHost = this.requireNode(content, 'MiddleContainer/BoardHost');
        const boardSize = boardHost.getComponent(UITransform)!;
        this.board = new BoardView(boardHost, this.assets, {
            width: boardSize.width,
            height: boardSize.height,
            onSwipe: (direction) => void this.move(direction),
        });
        this.board.render(this.state);

        this.sheepLabel = this.requireNode(bottom, 'SheepStatus').getComponent(Label);
        this.goalLabel = this.requireNode(bottom, 'GoalStatus').getComponent(Label);
        this.wolfLabel = this.requireNode(bottom, 'WolfStatus').getComponent(Label);
        this.messageLabel = this.requireNode(bottom, 'MessageBar').getComponent(Label);
        this.updateHud();
        this.updateUndoButton();
    }

    private buildGameScreenLegacy(): void {
        if (!this.state) return;
        const frame = this.beginScreen('UIGame');
        const topWidth = this.frameWidth - 20;
        const topY = this.frameHeight / 2 - 40;
        const topPanel = createPanel(frame, 'TopPanel', topWidth, 56, 0, topY, {
            fill: new Color(245, 218, 151, 238),
            stroke: new Color(90, 62, 26, 225),
            lineWidth: 3,
            radius: 8,
        });
        createSpriteButton(
            topPanel,
            'HomeButton',
            this.assets.get('homeButton'),
            38,
            40,
            -topWidth / 2 + 25,
            0,
            () => this.goHome(),
        );
        createSpriteButton(
            topPanel,
            'ReplayButton',
            this.assets.get('replayButton'),
            38,
            40,
            topWidth / 2 - 24,
            0,
            () => this.resetLevel(),
        );

        if (this.progressTracking) {
            createSpriteButton(
                topPanel,
                'NextLevelButton',
                this.assets.get('nextButton'),
                70,
                40,
                topWidth / 2 - 82,
                0,
                () => void this.goNextLevel(),
            );
            createSpriteButton(
                topPanel,
                'PreviousLevelButton',
                this.assets.get('previousButton'),
                70,
                40,
                topWidth / 2 - 156,
                0,
                () => void this.goPreviousLevel(),
            );
        } else {
            this.undoButton = createSpriteButton(
                topPanel,
                'UndoButton',
                this.assets.get('undoButton'),
                70,
                40,
                topWidth / 2 - 82,
                0,
                () => void this.undoPlaytestMove(),
            );
        }

        const seasonY = this.frameHeight / 2 - 88;
        const season = createPanel(frame, 'SeasonBar', topWidth, 34, 0, seasonY, {
            fill: new Color(49, 83, 47, 225),
            stroke: new Color(255, 239, 169, 190),
            lineWidth: 2,
            radius: 17,
        });
        createLabel(season, 'LevelNumber', this.progressTracking ? `第 ${this.currentLevel + 1} 关` : '关卡试玩', 110, 30, 16, new Color(255, 248, 215), -topWidth / 2 + 66, 0);
        createLabel(season, 'LevelTitle', this.state.level.title ?? '自定义关卡', 190, 30, 16, new Color(255, 248, 215), topWidth / 2 - 104, 0);

        const boardTop = this.frameHeight / 2 - 112;
        const boardBottom = -this.frameHeight / 2 + 104;
        const boardHeight = boardTop - boardBottom;
        const boardHost = createUiNode(frame, 'BoardHost', this.frameWidth - 20, boardHeight, 0, (boardTop + boardBottom) / 2);
        this.board = new BoardView(boardHost, this.assets, {
            width: this.frameWidth - 20,
            height: boardHeight,
            onSwipe: (direction) => void this.move(direction),
        });
        this.board.render(this.state);

        const statusY = -this.frameHeight / 2 + 73;
        const statusGap = 8;
        const statusWidth = (topWidth - statusGap * 2) / 3;
        this.sheepLabel = this.createStatusBox(frame, 'SheepStatus', '小羊', statusWidth, -statusWidth - statusGap, statusY, false);
        this.goalLabel = this.createStatusBox(frame, 'GoalStatus', '进楼', statusWidth, 0, statusY, true);
        this.wolfLabel = this.createStatusBox(frame, 'WolfStatus', '野狼', statusWidth, statusWidth + statusGap, statusY, false);
        const messagePanel = createPanel(frame, 'MessageBar', topWidth, 34, 0, -this.frameHeight / 2 + 25, {
            fill: new Color(48, 67, 39, 220),
            stroke: new Color(255, 238, 165, 170),
            lineWidth: 2,
            radius: 17,
        });
        this.messageLabel = createLabel(messagePanel, 'Message', '滑动屏幕，护送小羊逃进羊村', topWidth - 18, 30, 15, new Color(255, 246, 208));
        this.updateHud();
        this.updateUndoButton();
    }

    private createStatusBox(
        parent: Node,
        name: string,
        caption: string,
        width: number,
        x: number,
        y: number,
        goal: boolean,
    ): Label {
        const panel = createPanel(parent, name, width, 50, x, y, {
            fill: goal ? new Color(84, 120, 62, 238) : new Color(244, 214, 145, 238),
            stroke: new Color(91, 61, 24, 220),
            lineWidth: 2,
            radius: 8,
        });
        const color = goal ? new Color(255, 246, 216) : new Color(78, 52, 23);
        createLabel(panel, `${name}Caption`, caption, width - 8, 18, 12, color, 0, 12);
        return createLabel(panel, `${name}Value`, '0', width - 8, 24, 18, color, 0, -9);
    }

    private updateHud(): void {
        if (!this.state) return;
        if (this.sheepLabel) this.sheepLabel.string = `小羊\n${this.state.sheep.length}`;
        if (this.wolfLabel) this.wolfLabel.string = `野狼\n${this.state.wolves.length}`;
        if (this.goalLabel) this.goalLabel.string = `进度\n${this.state.escapedSheep}/${this.state.goal}`;
    }

    private setMessage(text: string): void {
        if (this.messageLabel) this.messageLabel.string = text;
    }

    private async move(direction: Direction): Promise<void> {
        if (!this.state || !this.board || this.state.status !== 'playing') return;
        if (this.isMoving || this.isTransitioning || this.activeGuide) return;

        if (!this.progressTracking) this.history.push(cloneGameState(this.state));
        this.isMoving = true;
        this.updateUndoButton();
        this.sounds.play('slide', 0.72);
        const resolution = resolveTurn(this.state, direction);
        await this.board.animateTurn(resolution);
        this.state = resolution.state;
        this.board.followSheep(this.state, resolution);
        this.board.render(this.state);
        this.updateHud();
        this.isMoving = false;

        if (this.state.status === 'playing') {
            if (resolution.events.escaped.length > 0) {
                this.sounds.play('escape', 0.82);
            } else if (resolution.events.attacks.length > 0 || resolution.events.eaten.length > 0) {
                this.sounds.play('wolf', 0.82);
            }
        }

        if (this.state.status === 'win') {
            this.sounds.play('win', 0.9);
            this.setMessage('成功，小羊已逃进羊村');
            if (this.progressTracking) this.unlockNextLevel();
            const isLast = this.progressTracking && this.currentLevel >= this.levels.length - 1;
            this.showResultModal(
                isLast ? '狼来了通关' : '逃跑成功',
                isLast ? '小羊都走过了山路，回到首页可以重新开始。' : '小羊成功逃脱，继续穿过下一条山路。',
                this.progressTracking && !isLast,
            );
        } else if (this.state.status === 'lose') {
            this.sounds.play('lose', 0.9);
            this.setMessage('小羊被狼拦住了，请重新规划路线');
            this.showResultModal('逃跑失败', '没有小羊可以继续进楼，重走这一段山路。', false);
        } else {
            this.setMessage(`小羊和野狼向${DIRECTION_LABELS[direction]}滑动`);
        }
        this.updateUndoButton();
    }

    private unlockNextLevel(): void {
        const unlocked = Math.min(this.currentLevel + 1, this.levels.length - 1);
        if (unlocked <= this.maxUnlockedLevel) return;
        this.maxUnlockedLevel = unlocked;
        this.store.saveMaxUnlockedLevel(this.maxUnlockedLevel);
    }

    private resetLevel(): void {
        if (this.isMoving || this.isTransitioning) return;
        this.closeModal();
        const level = this.progressTracking ? this.levels[this.currentLevel] : this.playtestLevel;
        if (!level) return;
        this.state = createInitialState(level);
        this.history = [];
        this.buildGameScreen();
        this.maybeShowGuide();
    }

    private async goPreviousLevel(): Promise<void> {
        if (!this.progressTracking || this.isMoving || this.isTransitioning || this.activeGuide) return;
        if (this.currentLevel <= 0) {
            this.setMessage('已经是第一关');
            return;
        }
        await this.transitionToLevel(this.currentLevel - 1);
    }

    private async goNextLevel(): Promise<void> {
        if (!this.progressTracking || this.isMoving || this.isTransitioning || this.activeGuide) return;
        if (this.currentLevel >= this.levels.length - 1) {
            this.setMessage('狼来了已经走到终章');
            return;
        }
        if (this.currentLevel >= this.maxUnlockedLevel) {
            this.setMessage('请先通关当前关卡，才能进入下一关');
            return;
        }
        await this.transitionToLevel(this.currentLevel + 1);
    }

    private async transitionToLevel(index: number): Promise<void> {
        if (this.isMoving || this.isTransitioning) return;
        this.isTransitioning = true;
        this.sounds.play('transition', 0.65);
        this.closeModal();
        this.closeGuide(false);
        this.loadingRoot?.destroy();
        if (!this.uiLoadingPrefab) return;
        this.loadingRoot = instantiate(this.uiLoadingPrefab);
        this.runtimeRoot.addChild(this.loadingRoot);
        this.loadingRoot.setPosition(0, 0, 0);
        const loadingContent = this.requireNode(this.loadingRoot, 'PrefabContent');
        loadingContent.setScale(1, 1, 1);
        const cloud = this.requireNode(loadingContent, 'MiddleContainer/LoadingCloud');
        this.requireNode(loadingContent, 'MiddleContainer/LoadingLabel').active = false;
        cloud.setPosition(-this.screenWidth * 1.3, 0, 0);

        await new Promise<void>((resolve) => {
            tween(cloud)
                .to(0.43, { position: Vec3.ZERO }, { easing: 'cubicOut' })
                .call(() => {
                    this.currentLevel = index;
                    const level = this.progressTracking ? this.levels[index] : this.playtestLevel;
                    if (level) this.state = createInitialState(level);
                    this.history = [];
                    this.buildGameScreen();
                })
                .to(0.65, { position: new Vec3(this.screenWidth * 1.4, 0, 0) }, { easing: 'cubicIn' })
                .call(() => resolve())
                .start();
        });
        this.loadingRoot?.destroy();
        this.loadingRoot = null;
        this.isTransitioning = false;
        this.maybeShowGuide();
    }

    private showResultModal(title: string, message: string, showNext: boolean): void {
        this.closeModal();
        if (!this.screenRoot) return;
        const content = this.requireNode(this.screenRoot, 'PrefabContent');
        const modal = this.requireNode(content, 'ResultModal');
        modal.active = true;
        this.modalRoot = modal;
        const panel = this.requireNode(modal, 'ModalPanel');
        this.requireNode(panel, 'ModalTitle').getComponent(Label)!.string = title;
        this.requireNode(panel, 'ModalMessage').getComponent(Label)!.string = message;
        bindButton(this.requireNode(panel, 'ModalHome'), () => this.goHome());
        bindButton(this.requireNode(panel, 'ModalReplay'), () => this.resetLevel());
        const next = this.requireNode(panel, 'ModalNext');
        next.active = showNext;
        if (showNext) bindButton(next, () => void this.goNextLevel());
    }

    private showResultModalLegacy(title: string, message: string, showNext: boolean): void {
        this.closeModal();
        this.modalRoot = createUiNode(this.runtimeRoot, 'ResultModal', this.screenWidth, this.screenHeight);
        createPanel(this.modalRoot, 'ModalShade', this.screenWidth, this.screenHeight, 0, 0, {
            fill: new Color(31, 47, 29, 155),
        });
        const panel = createPanel(this.modalRoot, 'ModalPanel', 330, 270, 0, 0, {
            fill: new Color(241, 213, 154, 252),
            stroke: new Color(78, 55, 24, 235),
            lineWidth: 4,
            radius: 10,
        });
        createSprite(panel, 'ModalHero', this.assets.get('hero'), 112, 112, 0, 74);
        createLabel(panel, 'ModalTitle', title, 290, 40, 27, new Color(61, 42, 21), 0, 16);
        createLabel(panel, 'ModalMessage', message, 284, 66, 16, new Color(94, 64, 29), 0, -34);
        const actionsY = -99;
        createSpriteButton(panel, 'ModalHome', this.assets.get('homeButton'), 48, 50, showNext ? -80 : -35, actionsY, () => this.goHome());
        createSpriteButton(panel, 'ModalReplay', this.assets.get('replayButton'), 48, 50, showNext ? -18 : 35, actionsY, () => this.resetLevel());
        if (showNext) {
            createSpriteButton(panel, 'ModalNext', this.assets.get('nextButton'), 86, 50, 72, actionsY, () => void this.goNextLevel());
        }
    }

    private closeModal(): void {
        if (this.modalRoot?.isValid) {
            this.modalRoot.active = false;
            this.modalRoot.destroy();
        }
        this.modalRoot = null;
    }

    private goHome(): void {
        if (this.isMoving || this.isTransitioning) return;
        this.closeModal();
        this.closeGuide(false);
        this.currentLevel = 0;
        this.progressTracking = true;
        this.playtestLevel = null;
        this.state = createInitialState(this.levels[0]);
        this.showStartScreen();
    }

    private maybeShowGuide(): void {
        if (!this.progressTracking || !this.state || !this.board) return;
        const levelNumber = this.currentLevel + 1;
        const guide = this.guides.find((candidate) => candidate.level === levelNumber);
        if (!guide || this.seenGuideLevels.has(levelNumber)) return;
        if (guide.highlight.row >= this.state.rows || guide.highlight.col >= this.state.cols) return;

        this.board.focusCell(guide.highlight.row, guide.highlight.col, this.state);
        this.board.render(this.state);
        const world = this.board.getCellWorldPosition(guide.highlight.row, guide.highlight.col);
        if (!world) return;
        const local = this.runtimeRoot.getComponent(UITransform)!.convertToNodeSpaceAR(world);
        const spotSize = this.board.getCellSize() + 10;
        this.activeGuide = guide;
        this.guideLineIndex = 0;
        this.sounds.play('guide', 0.7);
        if (!this.uiGuidePrefab) return;
        this.guideRoot = instantiate(this.uiGuidePrefab);
        this.runtimeRoot.addChild(this.guideRoot);
        this.guideRoot.setPosition(0, 0, 0);
        this.guideRoot.getComponent(UITransform)?.setContentSize(this.screenWidth, this.screenHeight);
        const content = this.requireNode(this.guideRoot, 'PrefabContent');
        content.setScale(1, 1, 1);
        this.layoutGuideShade(content, local.x, local.y, spotSize);
        const spotlight = this.requireNode(content, 'MiddleContainer/Spotlight');
        spotlight.setPosition(local.x, local.y, 0);
        spotlight.getComponent(UITransform)!.setContentSize(spotSize, spotSize);
        drawPanel(spotlight, spotSize, spotSize, {
            fill: new Color(255, 255, 255, 0),
            stroke: new Color(255, 236, 150, 245),
            lineWidth: 3,
            radius: 9,
        });
        this.requireNode(content, 'BottomContainer/GuideText').getComponent(Label)!.string = guide.lines[0];
        this.guideRoot.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            event.propagationStopped = true;
            this.advanceGuide();
        });
    }

    private layoutGuideShade(root: Node, spotX: number, spotY: number, spotSize: number): void {
        const left = -this.screenWidth / 2;
        const right = this.screenWidth / 2;
        const bottom = -this.screenHeight / 2;
        const top = this.screenHeight / 2;
        const spotLeft = spotX - spotSize / 2;
        const spotRight = spotX + spotSize / 2;
        const spotBottom = spotY - spotSize / 2;
        const spotTop = spotY + spotSize / 2;
        const setRect = (name: string, width: number, height: number, x: number, y: number): void => {
            const node = this.requireNode(root, name);
            node.setPosition(x, y, 0);
            node.getComponent(UITransform)!.setContentSize(Math.max(0, width), Math.max(0, height));
        };
        setRect('GuideShadeTop', this.screenWidth, top - spotTop, 0, (top + spotTop) / 2);
        setRect('GuideShadeBottom', this.screenWidth, spotBottom - bottom, 0, (spotBottom + bottom) / 2);
        setRect('GuideShadeLeft', spotLeft - left, spotSize, (left + spotLeft) / 2, spotY);
        setRect('GuideShadeRight', right - spotRight, spotSize, (spotRight + right) / 2, spotY);
    }

    private advanceGuide(): void {
        if (!this.activeGuide || !this.guideRoot) return;
        this.sounds.play('guide', 0.55);
        if (this.guideLineIndex < this.activeGuide.lines.length - 1) {
            this.guideLineIndex += 1;
            const label = this.guideRoot.getChildByPath('PrefabContent/BottomContainer/GuideText')?.getComponent(Label);
            if (label) label.string = this.activeGuide.lines[this.guideLineIndex];
            return;
        }
        this.seenGuideLevels.add(this.activeGuide.level);
        this.store.saveSeenGuideLevels(this.seenGuideLevels);
        this.closeGuide(false);
    }

    private closeGuide(markSeen: boolean): void {
        if (markSeen && this.activeGuide) {
            this.seenGuideLevels.add(this.activeGuide.level);
            this.store.saveSeenGuideLevels(this.seenGuideLevels);
        }
        if (this.guideRoot?.isValid) {
            this.guideRoot.active = false;
            this.guideRoot.destroy();
        }
        this.guideRoot = null;
        this.activeGuide = null;
        this.guideLineIndex = 0;
    }

    private updateUndoButton(): void {
        if (!this.undoButton) return;
        const enabled = !this.progressTracking && !this.isMoving && !this.isTransitioning && this.history.length > 0;
        const button = this.undoButton.getComponent(Button);
        if (button) button.interactable = enabled;
        const opacity = this.undoButton.getComponent(UIOpacity) ?? this.undoButton.addComponent(UIOpacity);
        opacity.opacity = enabled ? 255 : 115;
    }

    private async undoPlaytestMove(): Promise<void> {
        if (this.progressTracking || this.isMoving || this.isTransitioning || !this.board || this.history.length === 0) return;
        const previous = this.history.pop();
        if (!previous) return;
        this.isMoving = true;
        this.updateUndoButton();
        await this.board.animateRestore(previous);
        this.sounds.play('undo', 0.75);
        this.state = cloneGameState(previous);
        this.updateHud();
        this.setMessage('已返回上一步');
        this.isMoving = false;
        this.updateUndoButton();
    }

    private showEditorScreen(): void {
        if (this.isMoving || this.isTransitioning) return;
        const content = this.showScreenPrefab(this.uiEditorPrefab, 'UIEditor');
        const top = this.requireNode(content, 'TopContainer');
        const bottom = this.requireNode(content, 'BottomContainer');

        bindButton(this.requireNode(top, 'HomeButton'), () => this.showStartScreen());
        this.requireNode(top, 'GoalValue').getComponent(Label)!.string = `逃离 ${this.editorGoal}`;
        this.requireNode(top, 'RowsValue').getComponent(Label)!.string = `行 ${this.editorRows}`;
        this.requireNode(top, 'ColsValue').getComponent(Label)!.string = `列 ${this.editorCols}`;
        this.requireNode(top, 'MoveObstacleToggle').getComponent(Label)!.string = this.editorMoveObstacle ? '障碍 开' : '障碍 关';
        bindButton(this.requireNode(top, 'GoalMinus'), () => this.changeEditorGoal(-1));
        bindButton(this.requireNode(top, 'GoalPlus'), () => this.changeEditorGoal(1));
        bindButton(this.requireNode(top, 'RowsMinus'), () => this.changeEditorSize(-1, 0));
        bindButton(this.requireNode(top, 'RowsPlus'), () => this.changeEditorSize(1, 0));
        bindButton(this.requireNode(top, 'ColsMinus'), () => this.changeEditorSize(0, -1));
        bindButton(this.requireNode(top, 'ColsPlus'), () => this.changeEditorSize(0, 1));
        bindButton(this.requireNode(top, 'ResizeMap'), () => this.updateEditorMessage());
        bindButton(this.requireNode(top, 'MoveObstacleToggle'), () => {
            this.editorMoveObstacle = this.editorMoveObstacle ? 0 : 1;
            this.showEditorScreen();
        });
        bindButton(this.requireNode(top, 'ClearButton'), () => this.clearEditor());
        bindButton(this.requireNode(top, 'PlayButton'), () => void this.playEditorLevel());
        bindButton(this.requireNode(top, 'SaveButton'), () => void this.saveEditorLevel());

        const boardHost = this.requireNode(content, 'MiddleContainer/BoardHost');
        const boardSize = boardHost.getComponent(UITransform)!;
        this.board = new BoardView(boardHost, this.assets, {
            width: boardSize.width,
            height: boardSize.height,
            onCellPress: (row, col) => this.placeEditorTile(row, col),
        });
        this.renderEditorBoard();

        const tabs = this.requireNode(bottom, 'EditorTabs');
        EDITOR_GROUPS.forEach((group) => {
            bindButton(this.requireNode(tabs, `Tab-${group.key}`), () => {
                this.selectedEditorGroup = group.key;
                this.selectedEditorId = group.tools[0].id;
                this.showEditorScreen();
            });
        });
        const palette = this.requireNode(bottom, 'Palette');
        palette.removeAllChildren();
        this.buildEditorPalette(palette);
        this.editorMessageLabel = this.requireNode(bottom, 'EditorMessage').getComponent(Label);
        this.updateEditorMessage();
    }

    private showEditorScreenLegacy(): void {
        if (this.isMoving || this.isTransitioning) return;
        const frame = this.beginScreen('UIEditor');
        const contentWidth = this.frameWidth - 20;
        const topY = this.frameHeight / 2 - 40;
        const top = createPanel(frame, 'EditorTopPanel', contentWidth, 56, 0, topY, {
            fill: new Color(245, 218, 151, 238),
            stroke: new Color(90, 62, 26, 225),
            lineWidth: 3,
            radius: 8,
        });
        createSpriteButton(top, 'EditorHome', this.assets.get('homeButton'), 38, 40, -contentWidth / 2 + 25, 0, () => this.showStartScreen());
        createLabel(top, 'EditorTitle', '编辑关卡', 96, 38, 19, new Color(78, 52, 23), -91, 0);
        createLabel(top, 'EditorGoal', `逃离 ${this.editorGoal}`, 62, 32, 14, new Color(78, 52, 23), 4, 0);
        createTextButton(top, 'GoalMinus', '-', 28, 30, 52, 0, () => this.changeEditorGoal(-1));
        createTextButton(top, 'GoalPlus', '+', 28, 30, 84, 0, () => this.changeEditorGoal(1));
        createTextButton(
            top,
            'MoveObstacleToggle',
            this.editorMoveObstacle ? '障碍 开' : '障碍 关',
            72,
            32,
            137,
            0,
            () => {
                this.editorMoveObstacle = this.editorMoveObstacle ? 0 : 1;
                this.editorMessage = this.editorMoveObstacle ? '障碍会跟随滑动' : '障碍保持固定';
                this.showEditorScreen();
            },
            this.editorMoveObstacle === 1,
        );

        const sizeY = this.frameHeight / 2 - 91;
        const sizeBar = createPanel(frame, 'EditorSizeBar', contentWidth, 40, 0, sizeY, {
            fill: new Color(48, 67, 39, 210),
            stroke: new Color(255, 238, 165, 120),
            lineWidth: 2,
            radius: 8,
        });
        createLabel(sizeBar, 'RowsLabel', `行 ${this.editorRows}`, 45, 28, 14, new Color(255, 246, 208), -145, 0);
        createTextButton(sizeBar, 'RowsMinus', '-', 28, 28, -108, 0, () => this.changeEditorSize(-1, 0));
        createTextButton(sizeBar, 'RowsPlus', '+', 28, 28, -76, 0, () => this.changeEditorSize(1, 0));
        createLabel(sizeBar, 'ColsLabel', `列 ${this.editorCols}`, 45, 28, 14, new Color(255, 246, 208), -26, 0);
        createTextButton(sizeBar, 'ColsMinus', '-', 28, 28, 10, 0, () => this.changeEditorSize(0, -1));
        createTextButton(sizeBar, 'ColsPlus', '+', 28, 28, 42, 0, () => this.changeEditorSize(0, 1));
        createTextButton(sizeBar, 'ResizeMap', '生成地图', 86, 30, 122, 0, () => {
            this.editorMessage = `已生成 ${this.editorRows} 行 × ${this.editorCols} 列地图`;
            this.updateEditorMessage();
        }, true);

        const actionY = this.frameHeight / 2 - 134;
        const actionWidth = (contentWidth - 12) / 3;
        createTextButton(frame, 'EditorClear', '清空', actionWidth, 36, -actionWidth - 6, actionY, () => this.clearEditor());
        createTextButton(frame, 'EditorPlay', '试玩', actionWidth, 36, 0, actionY, () => void this.playEditorLevel());
        createTextButton(frame, 'EditorSave', '保存', actionWidth, 36, actionWidth + 6, actionY, () => void this.saveEditorLevel(), true);

        const tabsY = -this.frameHeight / 2 + 122;
        const paletteY = -this.frameHeight / 2 + 79;
        const messageY = -this.frameHeight / 2 + 25;
        const boardTop = this.frameHeight / 2 - 158;
        const boardBottom = -this.frameHeight / 2 + 146;
        const boardHeight = boardTop - boardBottom;
        const boardHost = createUiNode(frame, 'EditorBoardHost', contentWidth, boardHeight, 0, (boardTop + boardBottom) / 2);
        this.board = new BoardView(boardHost, this.assets, {
            width: contentWidth,
            height: boardHeight,
            onCellPress: (row, col) => this.placeEditorTile(row, col),
        });
        this.renderEditorBoard();

        const tabs = createPanel(frame, 'EditorTabs', contentWidth, 34, 0, tabsY, {
            fill: new Color(48, 67, 39, 215),
            stroke: new Color(255, 238, 165, 125),
            lineWidth: 2,
            radius: 8,
        });
        const tabWidth = (contentWidth - 10) / EDITOR_GROUPS.length;
        EDITOR_GROUPS.forEach((group, index) => {
            const x = -contentWidth / 2 + 5 + tabWidth / 2 + index * tabWidth;
            createTextButton(tabs, `Tab-${group.key}`, group.label, tabWidth - 3, 26, x, 0, () => {
                this.selectedEditorGroup = group.key;
                this.selectedEditorId = group.tools[0].id;
                this.editorMessage = `已切换：${group.label}`;
                this.showEditorScreen();
            }, this.selectedEditorGroup === group.key);
        });

        const palette = createPanel(frame, 'EditorPalette', contentWidth, 52, 0, paletteY, {
            fill: new Color(48, 67, 39, 220),
            stroke: new Color(255, 238, 165, 150),
            lineWidth: 2,
            radius: 8,
        });
        this.buildEditorPalette(palette);
        const message = createPanel(frame, 'EditorMessageBar', contentWidth, 34, 0, messageY, {
            fill: new Color(48, 67, 39, 220),
            stroke: new Color(255, 238, 165, 150),
            lineWidth: 2,
            radius: 8,
        });
        this.editorMessageLabel = createLabel(message, 'EditorMessage', this.editorMessage, contentWidth - 16, 28, 14, new Color(255, 246, 208));
    }

    private renderEditorBoard(): void {
        if (!this.board) return;
        this.board.render(createInitialState(buildLevel(
            this.editorMap,
            this.editorGoal,
            this.editorMoveObstacle,
            '自定义关卡',
        )));
    }

    private buildEditorPalette(parent: Node): void {
        const group = EDITOR_GROUPS.find((candidate) => candidate.key === this.selectedEditorGroup) ?? EDITOR_GROUPS[0];
        const slotWidth = 52;
        const startX = -(group.tools.length - 1) * slotWidth / 2;
        group.tools.forEach((tool, index) => {
            const selected = tool.id === this.selectedEditorId;
            const slot = createPanel(parent, `Tool-${tool.id}`, 46, 44, startX + index * slotWidth, 0, {
                fill: selected ? new Color(255, 238, 165, 70) : new Color(255, 255, 255, 0),
                stroke: selected ? new Color(255, 246, 178, 250) : new Color(255, 255, 255, 0),
                lineWidth: selected ? 3 : 0,
                radius: 4,
            });
            if (tool.id === 0) {
                createLabel(slot, 'Eraser', '擦', 38, 38, 20, new Color(255, 246, 208));
            } else {
                const frame = this.assets.forTile(tool.id);
                if (frame) createSprite(slot, `ToolArt-${tool.id}`, frame, 40, 40);
            }
            bindButton(slot, () => {
                this.selectedEditorId = tool.id;
                this.editorMessage = tool.id ? `已选择：${tool.label}` : '已选择：擦除';
                this.showEditorScreen();
            });
        });
    }

    private placeEditorTile(row: number, col: number): void {
        this.sounds.play('click', 0.55);
        this.editorMap = placeTile(this.editorMap, row, col, this.selectedEditorId);
        this.renderEditorBoard();
    }

    private changeEditorGoal(delta: number): void {
        this.editorGoal = Math.min(10, Math.max(1, this.editorGoal + delta));
        this.editorMessage = `逃离目标：${this.editorGoal}`;
        this.showEditorScreen();
    }

    private changeEditorSize(rowDelta: number, colDelta: number): void {
        const rows = clampEditorSize(this.editorRows + rowDelta, this.editorRows);
        const cols = clampEditorSize(this.editorCols + colDelta, this.editorCols);
        if (rows === this.editorRows && cols === this.editorCols) return;
        this.editorRows = rows;
        this.editorCols = cols;
        this.editorMap = resizeMap(this.editorMap, rows, cols);
        this.editorMessage = `已生成 ${rows} 行 × ${cols} 列地图`;
        this.showEditorScreen();
    }

    private clearEditor(): void {
        this.editorMap = createEmptyMap(this.editorRows, this.editorCols);
        this.editorMessage = '已清空地图';
        this.renderEditorBoard();
        this.updateEditorMessage();
    }

    private updateEditorMessage(): void {
        if (this.editorMessageLabel) this.editorMessageLabel.string = this.editorMessage;
    }

    private buildEditorLevel(): LevelDefinition {
        return buildLevel(this.editorMap, this.editorGoal, this.editorMoveObstacle, '自定义关卡');
    }

    private async playEditorLevel(): Promise<void> {
        if (this.isMoving || this.isTransitioning) return;
        this.playtestLevel = this.buildEditorLevel();
        this.progressTracking = false;
        this.currentLevel = 0;
        this.history = [];
        this.state = createInitialState(this.playtestLevel);
        this.buildGameScreen();
        await this.transitionToLevel(0);
    }

    private async saveEditorLevel(): Promise<void> {
        const level = this.buildEditorLevel();
        const json = exportLevelJson(level);
        this.store.saveCustomLevel(level);
        this.editorMessage = '关卡已保存到本机';
        this.updateEditorMessage();
        const copied = await Promise.race([
            this.copyText(json),
            new Promise<boolean>((resolve) => this.scheduleOnce(() => resolve(false), 1)),
        ]);
        if (copied) {
            this.editorMessage = '关卡已保存，数据已复制到剪贴板';
            this.updateEditorMessage();
        }
    }

    private async copyText(text: string): Promise<boolean> {
        const platform = globalThis as unknown as {
            wx?: { setClipboardData(options: { data: string; success(): void; fail(): void }): void };
            navigator?: { clipboard?: { writeText(value: string): Promise<void> } };
        };
        if (platform.wx?.setClipboardData) {
            return new Promise((resolve) => {
                platform.wx!.setClipboardData({ data: text, success: () => resolve(true), fail: () => resolve(false) });
            });
        }
        if (platform.navigator?.clipboard?.writeText) {
            try {
                await platform.navigator.clipboard.writeText(text);
                return true;
            } catch {
                return false;
            }
        }
        return false;
    }
}
