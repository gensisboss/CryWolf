import {
    _decorator,
    Button,
    Color,
    Component,
    EventTouch,
    instantiate,
    Label,
    Node,
    Prefab,
    profiler,
    ResolutionPolicy,
    screen,
    UITransform,
    UIOpacity,
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
    createLabel,
    createPanel,
    createSprite,
    createUiNode,
    drawPanel,
} from './UiFactory';
import { UiScreenManager } from './UiScreenManager';
import { SoundManager } from './SoundManager';
import { LoadingTransition } from './LoadingTransition';

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
    @property(Prefab) private uiGuidePrefab: Prefab | null = null;
    @property(Prefab) private uiEditorPrefab: Prefab | null = null;
    @property(Node) private transitionCloud: Node | null = null;

    private readonly assets = new AssetCatalog();
    private readonly repository = new GameDataRepository();
    private readonly store = new ProgressStore();

    private runtimeRoot!: Node;
    private uiScreens!: UiScreenManager;
    private sounds!: SoundManager;
    private screenRoot: Node | null = null;
    private modalRoot: Node | null = null;
    private guideRoot: Node | null = null;
    private screenWidth = 430;
    private screenHeight = 760;

    private levels: LevelDefinition[] = [];
    private guides: GuideDefinition[] = [];
    private currentLevel = 0;
    private maxUnlockedLevel = 0;
    private maxCompletedLevels = 0;
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
        LoadingTransition.dispose(this.transitionCloud);
    }

    private async boot(): Promise<void> {
        profiler.hideStats();
        this.updateViewportMetrics();
        this.runtimeRoot = createUiNode(this.node, 'CryWolfRuntime', this.screenWidth, this.screenHeight);
        this.runtimeRoot.setScale(UI_SCALE, UI_SCALE, 1);
        this.uiScreens = new UiScreenManager(this.runtimeRoot);
        this.sounds = new SoundManager(this.node);
        if (this.transitionCloud) {
            LoadingTransition.configure(this.transitionCloud, this.node, DESIGN_WIDTH * 1.2);
        }
        view.on('canvas-resize', this.handleCanvasResize, this);

        try {
            await LoadingTransition.run(async () => {
                const [levels, guides] = await Promise.all([
                    this.repository.loadLevels(),
                    this.repository.loadGuides(),
                    this.assets.load(),
                    this.sounds.load(),
                ]).then(([loadedLevels, loadedGuides]) => [loadedLevels, loadedGuides] as const);
                this.levels = levels;
                this.guides = guides;
                if (this.levels.length === 0) throw new Error('No playable levels found');

                this.maxCompletedLevels = Math.min(this.store.loadMaxCompletedLevels(), this.levels.length);
                this.maxUnlockedLevel = Math.min(this.maxCompletedLevels, this.levels.length - 1);
                this.currentLevel = this.resumeLevelIndex();
                this.seenGuideLevels = this.store.loadSeenGuideLevels();
                this.state = createInitialState(this.levels[this.currentLevel]);
                this.loadSavedEditorLevel();
                this.showStartScreen();
                this.sounds.playMusic();
            });
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
    }

    private handleCanvasResize(): void {
        if (!this.runtimeRoot?.isValid) return;
        const activeScreen = this.uiScreens.currentName;
        this.updateViewportMetrics();
        this.runtimeRoot.getComponent(UITransform)?.setContentSize(this.screenWidth, this.screenHeight);
        this.runtimeRoot.setScale(UI_SCALE, UI_SCALE, 1);
        this.closeModal();
        this.closeGuide(false);

        if (activeScreen === 'UIGame' && this.state) {
            this.buildGameScreen();
        } else if (activeScreen === 'UIEditor') {
            this.showEditorScreen();
        } else if (activeScreen === 'UIMain') {
            this.showStartScreen();
        }
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

    private requireLabel(node: Node): Label {
        const label = node.getComponent(Label) ?? node.getChildByName('Label')?.getComponent(Label);
        if (!label) throw new Error(`Prefab node ${node.name} is missing Label`);
        return label;
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
        this.currentLevel = this.resumeLevelIndex();
        await this.transitionToLevel(this.currentLevel);
    }

    private resumeLevelIndex(): number {
        return Math.min(this.maxCompletedLevels, Math.max(0, this.levels.length - 1));
    }

    private buildGameScreen(): void {
        if (!this.state) return;
        const content = this.showScreenPrefab(this.uiGamePrefab, 'UIGame');
        const top = this.requireNode(content, 'TopContainer');
        const bottom = this.requireNode(content, 'BottomContainer');

        bindButton(this.requireNode(top, 'HomeButton'), () => this.goHome());
        bindButton(this.requireNode(top, 'ReplayButton'), () => void this.resetLevel());
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

        this.sheepLabel = this.requireLabel(this.requireNode(bottom, 'SheepStatus'));
        this.goalLabel = this.requireLabel(this.requireNode(bottom, 'GoalStatus'));
        this.wolfLabel = this.requireLabel(this.requireNode(bottom, 'WolfStatus'));
        this.messageLabel = this.requireLabel(this.requireNode(bottom, 'MessageBar'));
        this.updateHud();
        this.updateUndoButton();
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

        if (resolution.events.escaped.length > 0) {
            this.sounds.play('escape', 0.82);
        }
        if (resolution.events.attacks.length > 0 || resolution.events.eaten.length > 0) {
            this.sounds.play('eat', 0.88);
        }
        if (resolution.events.trappedSheep.length > 0) {
            this.sounds.play('trap', 0.85);
        }
        if (resolution.events.trappedWolves.length > 0) {
            this.sounds.play('death', 0.78);
        }

        if (this.state.status === 'win') {
            this.sounds.play('win', 0.9);
            this.setMessage('成功，小羊已逃进羊村');
            if (this.progressTracking) this.recordCompletedLevel();
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

    private recordCompletedLevel(): void {
        const completed = Math.min(this.currentLevel + 1, this.levels.length);
        if (completed <= this.maxCompletedLevels) return;
        this.maxCompletedLevels = completed;
        this.maxUnlockedLevel = Math.min(completed, this.levels.length - 1);
        this.store.saveMaxCompletedLevels(this.maxCompletedLevels);
    }

    private async resetLevel(): Promise<void> {
        if (this.isMoving || this.isTransitioning) return;
        const level = this.progressTracking ? this.levels[this.currentLevel] : this.playtestLevel;
        if (!level) return;
        await this.transitionToLevel(this.currentLevel);
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
        try {
            await LoadingTransition.run(async () => {
                this.currentLevel = index;
                const level = this.progressTracking ? this.levels[index] : this.playtestLevel;
                if (level) this.state = createInitialState(level);
                this.history = [];
                this.buildGameScreen();
                await new Promise<void>((resolve) => this.scheduleOnce(resolve));
            });
        } finally {
            this.isTransitioning = false;
        }
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
        bindButton(this.requireNode(panel, 'ModalReplay'), () => void this.resetLevel());
        const next = this.requireNode(panel, 'ModalNext');
        next.active = showNext;
        if (showNext) bindButton(next, () => void this.goNextLevel());
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
        this.progressTracking = true;
        this.playtestLevel = null;
        this.currentLevel = this.resumeLevelIndex();
        this.state = createInitialState(this.levels[this.currentLevel]);
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
        this.requireLabel(this.requireNode(top, 'MoveObstacleToggle')).string = this.editorMoveObstacle ? '障碍 开' : '障碍 关';
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
            editorMode: true,
            onCellPress: (row, col) => this.placeEditorTile(row, col),
        });
        this.renderEditorBoard();

        const tabs = this.requireNode(bottom, 'EditorTabs');
        EDITOR_GROUPS.forEach((group) => {
            bindButton(this.requireNode(tabs, `Tab-${group.key}`), () => {
                this.selectedEditorGroup = group.key;
                this.selectedEditorId = group.tools[0].id;
                this.editorMessage = `已切换：${group.label}`;
                this.refreshEditorPalette(bottom);
            });
        });
        this.editorMessageLabel = this.requireLabel(this.requireNode(bottom, 'EditorMessage'));
        this.refreshEditorPalette(bottom);
        this.updateEditorMessage();
    }

    private refreshEditorPalette(bottom: Node): void {
        const palette = this.requireNode(bottom, 'Palette');
        palette.removeAllChildren();
        this.buildEditorPalette(palette);
        this.updateEditorMessage();
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
            const frame = this.assets.forTile(tool.id);
            if (frame) createSprite(slot, `ToolArt-${tool.id}`, frame, 40, 40);
            bindButton(slot, () => {
                this.selectedEditorId = tool.id;
                this.editorMessage = tool.id ? `已选择：${tool.label}` : '已选择：擦除';
                if (parent.parent) this.refreshEditorPalette(parent.parent);
            });
        });
    }

    private placeEditorTile(row: number, col: number): void {
        this.sounds.play('click', 0.55);
        const current = this.editorMap[row]?.[col] ?? 0;
        const nextId = current === 0 ? this.selectedEditorId : 0;
        this.editorMap = placeTile(this.editorMap, row, col, nextId);
        const state = createInitialState(this.buildEditorLevel());
        this.board?.updateEditorCell(row, col, nextId, state);
        this.editorMessage = nextId === 0 ? '已清除当前格子' : '已放置角色';
        this.updateEditorMessage();
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
        this.history = [];
        await this.transitionToLevel(this.currentLevel);
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
