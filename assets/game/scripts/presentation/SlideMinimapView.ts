import { Color, EventTouch, Graphics, Node, UITransform, Vec3 } from 'cc';
import { GameState } from '../domain/GameTypes';
import { createUiNode } from '../ui/UiFactory';
import { clampViewport, ViewportOrigin, VIEWPORT_SIZE } from '../domain/ViewportRules';

const MINIMAP_COLORS = {
    sheep: new Color(255, 255, 255, 255),
    wolf: new Color(150, 150, 150, 255),
    trap: new Color(224, 57, 50, 255),
    obstacle: new Color(125, 82, 42, 255),
    box: new Color(190, 128, 58, 255),
    village: new Color(255, 222, 78, 255),
};

export class SlideMinimapView {
    private readonly graphics: Graphics;

    public constructor(
        private readonly node: Node,
        private state: GameState,
        private origin: ViewportOrigin,
        private readonly onViewportChange: (origin: ViewportOrigin) => void,
    ) {
        this.graphics = node.addComponent(Graphics);
        this.bindInput();
        this.draw();
    }

    public update(state: GameState, origin: ViewportOrigin): void {
        this.state = state;
        this.origin = origin;
        this.draw();
    }

    public static create(
        parent: Node,
        state: GameState,
        origin: ViewportOrigin,
        onViewportChange: (origin: ViewportOrigin) => void,
    ): SlideMinimapView {
        const size = 104;
        const node = createUiNode(parent, 'SlideMinimap', size, size, parent.getComponent(UITransform)!.width / 2 - size / 2 - 10, parent.getComponent(UITransform)!.height / 2 - size / 2 - 10);
        return new SlideMinimapView(node, state, origin, onViewportChange);
    }

    private draw(): void {
        const width = this.node.getComponent(UITransform)!.width;
        const height = this.node.getComponent(UITransform)!.height;
        const padding = 6;
        const mapWidth = width - padding * 2;
        const mapHeight = height - padding * 2;
        const cellWidth = mapWidth / this.state.cols;
        const cellHeight = mapHeight / this.state.rows;
        const left = -width / 2 + padding;
        const bottom = -height / 2 + padding;
        const g = this.graphics;
        g.clear();
        g.fillColor = new Color(42, 65, 38, 235);
        g.roundRect(-width / 2, -height / 2, width, height, 6);
        g.fill();
        g.fillColor = new Color(112, 157, 79, 255);
        g.rect(left, bottom, mapWidth, mapHeight);
        g.fill();

        const dot = (row: number, col: number, color: Color, scale = 1): void => {
            g.fillColor = color;
            const size = Math.max(2, Math.min(5, Math.min(cellWidth, cellHeight) * scale));
            g.rect(left + col * cellWidth, bottom + (this.state.rows - row - 1) * cellHeight, size, size);
            g.fill();
        };
        this.state.obstacles.forEach((item) => dot(item.row, item.col, MINIMAP_COLORS.obstacle, 1.4));
        this.state.boxes.forEach((item) => dot(item.row, item.col, MINIMAP_COLORS.box, 1.4));
        this.state.traps.forEach((item) => dot(item.row, item.col, MINIMAP_COLORS.trap, 1.4));
        this.state.villages.forEach((item) => dot(item.row, item.col, MINIMAP_COLORS.village, 1.4));
        this.state.wolves.forEach((item) => dot(item.row, item.col, MINIMAP_COLORS.wolf, 1.5));
        this.state.sheep.forEach((item) => dot(item.row, item.col, MINIMAP_COLORS.sheep, 1.7));

        const visibleCols = Math.min(VIEWPORT_SIZE, this.state.cols);
        const visibleRows = Math.min(VIEWPORT_SIZE, this.state.rows);
        g.lineWidth = 2;
        g.strokeColor = new Color(255, 244, 156, 255);
        g.rect(
            left + this.origin.col * cellWidth,
            bottom + (this.state.rows - this.origin.row - visibleRows) * cellHeight,
            visibleCols * cellWidth,
            visibleRows * cellHeight,
        );
        g.stroke();
    }

    private bindInput(): void {
        const update = (event: EventTouch): void => {
            event.propagationStopped = true;
            const local = this.node.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(event.getUILocation().x, event.getUILocation().y));
            const width = this.node.getComponent(UITransform)!.width - 12;
            const height = this.node.getComponent(UITransform)!.height - 12;
            const col = Math.floor((local.x + width / 2) / width * this.state.cols - VIEWPORT_SIZE / 2);
            const rowFromBottom = (local.y + height / 2) / height * this.state.rows;
            const row = Math.floor(this.state.rows - rowFromBottom - VIEWPORT_SIZE / 2);
            this.origin = clampViewport({ row, col }, this.state.rows, this.state.cols);
            this.draw();
            this.onViewportChange(this.origin);
        };
        this.node.on(Node.EventType.TOUCH_START, update);
        this.node.on(Node.EventType.TOUCH_MOVE, update);
        this.node.on(Node.EventType.TOUCH_END, (event: EventTouch) => { event.propagationStopped = true; });
    }
}
