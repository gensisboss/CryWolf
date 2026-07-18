import {
    Color,
    EventTouch,
    Mask,
    Node,
    tween,
    UITransform,
    UIOpacity,
    Vec2,
    Vec3,
} from 'cc';
import { getTileKind } from '../domain/EntityCatalog';
import { Direction, Entity, GameState, TurnResolution } from '../domain/GameTypes';
import { AssetCatalog } from './AssetCatalog';
import { createCoverSprite, createPanel, createSprite, createUiNode, drawPanel } from '../ui/UiFactory';
import { SlideMinimapView } from './SlideMinimapView';
import { chooseFollowSheep, clampViewport, positionAlongMovement, viewportAround, viewportAroundContinuous, ViewportOrigin, VIEWPORT_SIZE } from '../domain/ViewportRules';

interface BoardViewOptions {
    width: number;
    height: number;
    onSwipe?: (direction: Direction) => void;
    onCellPress?: (row: number, col: number) => void;
}

export class BoardView {
    private readonly frame: Node;
    private readonly content: Node;
    private readonly actorNodes = new Map<string, Node>();
    private readonly cellNodes = new Map<string, Node>();
    private boardPanel: Node | null = null;
    private touchStart: Vec2 | null = null;
    private state: GameState | null = null;
    private cellSize = 44;
    private gap = 3;
    private viewport: ViewportOrigin = { row: 0, col: 0 };
    private visualViewport: ViewportOrigin = { row: 0, col: 0 };
    private viewportInitialized = false;
    private minimap: SlideMinimapView | null = null;

    public constructor(
        parent: Node,
        private readonly assets: AssetCatalog,
        private readonly options: BoardViewOptions,
    ) {
        this.frame = createUiNode(parent, 'BoardFrame', options.width, options.height);
        createCoverSprite(this.frame, 'MapBackground', assets.get('mapBackground'), options.width, options.height);
        const border = createUiNode(this.frame, 'BoardFrameBorder', options.width, options.height);
        drawPanel(border, options.width - 2, options.height - 2, {
            fill: new Color(255, 255, 255, 34),
            stroke: new Color(84, 58, 26, 220),
            lineWidth: 3,
            radius: 8,
        });
        this.content = createUiNode(this.frame, 'BoardWorldRoot', options.width - 16, options.height - 16);
        const mask = this.content.addComponent(Mask);
        mask.type = Mask.Type.GRAPHICS_RECT;
        this.bindInput();
    }

    public render(state: GameState, visualOrigin?: ViewportOrigin): void {
        this.state = state;
        this.content.removeAllChildren();
        this.actorNodes.clear();
        this.cellNodes.clear();

        if (!this.viewportInitialized) {
            const sheep = chooseFollowSheep(state);
            this.viewport = sheep ? viewportAround(sheep, state.rows, state.cols) : { row: 0, col: 0 };
            this.viewportInitialized = true;
        }
        this.viewport = clampViewport(this.viewport, state.rows, state.cols);
        this.visualViewport = visualOrigin ?? this.viewport;

        const visibleRows = Math.min(VIEWPORT_SIZE, state.rows);
        const visibleCols = Math.min(VIEWPORT_SIZE, state.cols);
        this.gap = 3;
        const usableWidth = this.options.width - 32;
        const usableHeight = this.options.height - 32;
        this.cellSize = Math.max(20, Math.min(
            44,
            (usableWidth - this.gap * (visibleCols - 1)) / visibleCols,
            (usableHeight - this.gap * (visibleRows - 1)) / visibleRows,
        ));

        const boardWidth = visibleCols * this.cellSize + (visibleCols - 1) * this.gap + 16;
        const boardHeight = visibleRows * this.cellSize + (visibleRows - 1) * this.gap + 16;
        const boardPanel = createPanel(this.content, 'BoardPanel', boardWidth, boardHeight, 0, 0, {
            fill: new Color(67, 101, 57, 230),
            stroke: new Color(57, 51, 25, 235),
            lineWidth: 3,
            radius: 8,
        });
        this.boardPanel = boardPanel;

        const obstacleByCell = new Map(state.obstacles.map((entity) => [this.positionKey(entity.row, entity.col), entity]));
        const trapByCell = new Map(state.traps.map((entity) => [this.positionKey(entity.row, entity.col), entity]));
        const villageByCell = new Map(state.villages.map((entity) => [this.positionKey(entity.row, entity.col), entity]));

        for (let row = 0; row < state.rows; row += 1) {
            for (let col = 0; col < state.cols; col += 1) {
                const key = this.positionKey(row, col);
                const obstacle = obstacleByCell.get(key);
                const trap = trapByCell.get(key);
                const village = villageByCell.get(key);
                const position = this.positionFor(row, col, state);
                const fill = obstacle && state.level.moveObstacle === 0
                    ? new Color(106, 82, 48, 245)
                    : trap
                        ? new Color(153, 70, 57, 245)
                        : village
                            ? new Color(145, 126, 68, 245)
                            : new Color(115, 174, 82, 245);
                const cell = createPanel(boardPanel, `Cell-${row}-${col}`, this.cellSize, this.cellSize, position.x, position.y, {
                    fill,
                    stroke: new Color(235, 226, 157, 70),
                    lineWidth: 1,
                    radius: 3,
                });
                this.cellNodes.set(key, cell);
                if (this.options.onCellPress) {
                    cell.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                        event.propagationStopped = true;
                        this.options.onCellPress?.(row, col);
                    });
                }

                const terrain = trap ?? village;
                if (terrain) {
                    const frame = this.assets.forTile(terrain.id);
                    if (frame) createSprite(cell, `Terrain-${terrain.id}`, frame, this.cellSize * 0.9, this.cellSize * 0.9);
                }
            }
        }

        for (const entity of [...state.obstacles, ...state.sheep, ...state.wolves]) {
            this.createActor(boardPanel, entity, state);
        }
        this.updateCameraPosition();

        const oldMinimap = this.frame.getChildByName('SlideMinimap');
        if (oldMinimap?.isValid) {
            oldMinimap.active = false;
            oldMinimap.destroy();
        }
        this.minimap = null;
        if (state.rows > VIEWPORT_SIZE || state.cols > VIEWPORT_SIZE) {
            this.minimap = SlideMinimapView.create(this.frame, state, this.visualViewport, (origin) => {
                this.viewport = origin;
                this.visualViewport = origin;
                if (this.state) this.render(this.state);
            });
        }
    }

    public followSheep(state: GameState, resolution?: TurnResolution): void {
        const sheep = chooseFollowSheep(state, resolution);
        if (sheep) {
            this.viewport = viewportAround(sheep, state.rows, state.cols);
            this.visualViewport = this.viewport;
        }
        this.viewportInitialized = true;
    }

    public focusCell(row: number, col: number, state: GameState): void {
        this.viewport = viewportAround({ row, col }, state.rows, state.cols);
        this.visualViewport = this.viewport;
        this.viewportInitialized = true;
    }

    public async animateTurn(resolution: TurnResolution): Promise<void> {
        if (!this.state) return;
        const state = this.state;
        if (state.rows > VIEWPORT_SIZE || state.cols > VIEWPORT_SIZE) {
            await this.animateLargeMapTurn(state, resolution);
        } else {
            const phaseOne = resolution.movements.flatMap((movement) => {
                const node = this.actorNodes.get(movement.key);
                if (!node) return [];
                return [this.tweenPosition(node, this.positionFor(movement.to.row, movement.to.col, state), 0.35)];
            });
            await Promise.all(phaseOne);
        }

        const effects: Array<Promise<void>> = [];
        const disappearing = new Set([
            ...resolution.events.escaped,
            ...resolution.events.trappedSheep,
            ...resolution.events.trappedWolves,
        ]);
        disappearing.forEach((key) => {
            const node = this.actorNodes.get(key);
            if (node) effects.push(this.tweenDisappear(node, 0.28));
        });

        resolution.events.attacks.forEach((attack) => {
            const wolf = this.actorNodes.get(attack.wolfKey);
            const sheep = this.actorNodes.get(attack.targetKey);
            if (wolf) effects.push(this.tweenPosition(wolf, this.positionFor(attack.to.row, attack.to.col, this.state!), 0.18));
            if (sheep) effects.push(this.tweenDisappear(sheep, 0.22));
        });
        await Promise.all(effects);
    }

    private async animateLargeMapTurn(state: GameState, resolution: TurnResolution): Promise<void> {
        const sheepMovements = resolution.movements.filter((movement) => movement.kind === 'sheep');
        const distance = (movement: TurnResolution['movements'][number]): number => (
            Math.abs(movement.to.row - movement.from.row) + Math.abs(movement.to.col - movement.from.col)
        );
        const followed = [...sheepMovements].sort((left, right) => distance(right) - distance(left))[0];
        if (!followed || distance(followed) === 0) {
            await Promise.all(resolution.movements.flatMap((movement) => {
                const node = this.actorNodes.get(movement.key);
                return node ? [this.tweenPosition(node, this.positionFor(movement.to.row, movement.to.col, state), 0.35)] : [];
            }));
            return;
        }

        const movementByKey = new Map(resolution.movements.map((movement) => [movement.key, movement]));
        const moveEntities = (entities: Entity[], progress: number): Entity[] => entities.map((entity) => {
            const movement = movementByKey.get(entity.key);
            return movement ? { ...entity, ...positionAlongMovement(movement, progress) } : { ...entity };
        });
        const update = (progress: number): void => {
            const followedPosition = positionAlongMovement(followed, progress);
            const visualOrigin = viewportAroundContinuous(followedPosition, state.rows, state.cols);
            const viewport = clampViewport(visualOrigin, state.rows, state.cols);
            const intermediate = {
                ...state,
                sheep: moveEntities(state.sheep, progress),
                wolves: moveEntities(state.wolves, progress),
                obstacles: moveEntities(state.obstacles, progress),
            };
            this.viewport = viewport;
            this.visualViewport = visualOrigin;
            this.viewportInitialized = true;
            this.updateRenderedPositions(intermediate);
        };
        await new Promise<void>((resolve) => {
            const driver = { progress: 0 };
            tween(driver)
                .to(0.35, { progress: 1 }, {
                    easing: 'cubicOut',
                    onUpdate: (target) => update(target?.progress ?? 0),
                })
                .call(() => resolve())
                .start();
        });
    }

    private updateRenderedPositions(state: GameState): void {
        for (const entity of [...state.obstacles, ...state.sheep, ...state.wolves]) {
            this.actorNodes.get(entity.key)?.setPosition(this.positionFor(entity.row, entity.col, state));
        }
        this.updateCameraPosition();
        this.minimap?.update(state, this.visualViewport);
    }

    private updateCameraPosition(): void {
        if (!this.boardPanel) return;
        const stride = this.cellSize + this.gap;
        this.boardPanel.setPosition(-this.visualViewport.col * stride, this.visualViewport.row * stride, 0);
    }

    public async animateRestore(target: GameState): Promise<void> {
        if (!this.state) return;
        const targetEntities = new Map(
            [...target.sheep, ...target.wolves, ...target.obstacles].map((entity) => [entity.key, entity]),
        );
        const restoredKeys = [...targetEntities.keys()].filter((key) => !this.actorNodes.has(key));
        const moves: Array<Promise<void>> = [];
        this.actorNodes.forEach((node, key) => {
            const targetEntity = targetEntities.get(key);
            if (targetEntity) {
                moves.push(this.tweenPosition(node, this.positionFor(targetEntity.row, targetEntity.col, target), 0.28));
            } else {
                moves.push(this.tweenDisappear(node, 0.22));
            }
        });
        await Promise.all(moves);
        this.followSheep(target);
        this.render(target);

        const fades = restoredKeys.flatMap((key) => {
            const node = this.actorNodes.get(key);
            if (!node) return [];
            const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
            opacity.opacity = 0;
            node.setScale(0.85, 0.85, 1);
            return [new Promise<void>((resolve) => {
                tween(opacity).to(0.22, { opacity: 255 }).start();
                tween(node).to(0.22, { scale: Vec3.ONE }).call(() => resolve()).start();
            })];
        });
        await Promise.all(fades);
    }

    public getCellWorldPosition(row: number, col: number): Vec3 | null {
        const node = this.cellNodes.get(this.positionKey(row, col));
        return node ? node.getWorldPosition(new Vec3()) : null;
    }

    public getCellSize(): number {
        return this.cellSize;
    }

    private createActor(parent: Node, entity: Entity, state: GameState): void {
        const frame = this.assets.forTile(entity.id);
        if (!frame) return;
        const position = this.positionFor(entity.row, entity.col, state);
        const size = entity.kind === 'obstacle' ? this.cellSize * 0.86 : this.cellSize * 0.9;
        const node = createSprite(parent, `Actor-${entity.key}`, frame, size, size, position.x, position.y);
        node.addComponent(UIOpacity);
        this.actorNodes.set(entity.key, node);
    }

    private bindInput(): void {
        if (!this.options.onSwipe) return;
        this.frame.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            this.touchStart = event.getUILocation();
        });
        const finishSwipe = (event: EventTouch): void => {
            if (!this.touchStart) return;
            const end = event.getUILocation();
            const dx = end.x - this.touchStart.x;
            const dy = end.y - this.touchStart.y;
            this.touchStart = null;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
            const direction: Direction = Math.abs(dx) > Math.abs(dy)
                ? (dx > 0 ? 'right' : 'left')
                : (dy > 0 ? 'up' : 'down');
            this.options.onSwipe?.(direction);
        };
        this.frame.on(Node.EventType.TOUCH_END, finishSwipe);
        this.frame.on(Node.EventType.TOUCH_CANCEL, finishSwipe);
    }

    private positionFor(row: number, col: number, state: GameState): Vec3 {
        const stride = this.cellSize + this.gap;
        const visibleRows = Math.min(VIEWPORT_SIZE, state.rows);
        const visibleCols = Math.min(VIEWPORT_SIZE, state.cols);
        return new Vec3(
            (col - (visibleCols - 1) / 2) * stride,
            ((visibleRows - 1) / 2 - row) * stride,
            0,
        );
    }

    private positionKey(row: number, col: number): string {
        return `${row},${col}`;
    }

    private tweenPosition(node: Node, position: Vec3, duration: number): Promise<void> {
        return new Promise((resolve) => {
            tween(node).to(duration, { position }, { easing: 'cubicOut' }).call(() => resolve()).start();
        });
    }

    private tweenDisappear(node: Node, duration: number): Promise<void> {
        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        return new Promise((resolve) => {
            tween(opacity).to(duration, { opacity: 0 }).start();
            tween(node)
                .to(duration, { scale: new Vec3(0.2, 0.2, 1) }, { easing: 'cubicIn' })
                .call(() => resolve())
                .start();
        });
    }
}
