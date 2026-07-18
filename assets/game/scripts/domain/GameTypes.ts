export type Direction = 'up' | 'down' | 'left' | 'right';

export type EntityKind = 'sheep' | 'wolf' | 'obstacle';

export type GameStatus = 'playing' | 'win' | 'lose';

export interface GridPosition {
    row: number;
    col: number;
}

export interface Entity extends GridPosition {
    key: string;
    id: number;
    kind: EntityKind;
}

export interface StaticEntity extends GridPosition {
    id: number;
}

export interface LevelDefinition {
    title?: string;
    goal: number;
    moveObstacle: 0 | 1;
    map: number[][];
}

export interface GuideDefinition {
    level: number;
    lines: string[];
    highlight: GridPosition;
}

export interface GameState {
    level: LevelDefinition;
    rows: number;
    cols: number;
    goal: number;
    escapedSheep: number;
    sheep: Entity[];
    wolves: Entity[];
    obstacles: Entity[];
    villages: StaticEntity[];
    traps: StaticEntity[];
    status: GameStatus;
}

export interface EntityMovement {
    key: string;
    id: number;
    kind: EntityKind;
    from: GridPosition;
    to: GridPosition;
}

export interface WolfAttack {
    wolfKey: string;
    targetKey: string;
    targetId: number;
    from: GridPosition;
    to: GridPosition;
}

export interface TurnEvents {
    escaped: string[];
    eaten: string[];
    trappedSheep: string[];
    trappedWolves: string[];
    attacks: WolfAttack[];
}

export interface TurnResolution {
    state: GameState;
    movements: EntityMovement[];
    events: TurnEvents;
}

export const DIRECTION_VECTORS: Record<Direction, readonly [number, number]> = {
    up: [-1, 0],
    down: [1, 0],
    left: [0, -1],
    right: [0, 1],
};
