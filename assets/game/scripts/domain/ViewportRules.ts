import { Entity, EntityMovement, GameState, GridPosition, TurnResolution } from './GameTypes';

export const VIEWPORT_SIZE = 6;

export interface ViewportOrigin {
    row: number;
    col: number;
}

export function clampViewport(origin: ViewportOrigin, rows: number, cols: number): ViewportOrigin {
    return {
        row: Math.max(0, Math.min(Math.max(0, rows - VIEWPORT_SIZE), Math.floor(origin.row))),
        col: Math.max(0, Math.min(Math.max(0, cols - VIEWPORT_SIZE), Math.floor(origin.col))),
    };
}

export function viewportAround(position: GridPosition, rows: number, cols: number): ViewportOrigin {
    return clampViewport({
        row: position.row - Math.floor(VIEWPORT_SIZE / 2),
        col: position.col - Math.floor(VIEWPORT_SIZE / 2),
    }, rows, cols);
}

export function isInViewport(position: GridPosition, origin: ViewportOrigin): boolean {
    return position.row >= origin.row
        && position.row < origin.row + VIEWPORT_SIZE
        && position.col >= origin.col
        && position.col < origin.col + VIEWPORT_SIZE;
}

export function positionAlongMovement(movement: EntityMovement, progress: number): GridPosition {
    const value = Math.max(0, Math.min(1, progress));
    return {
        row: Math.round(movement.from.row + (movement.to.row - movement.from.row) * value),
        col: Math.round(movement.from.col + (movement.to.col - movement.from.col) * value),
    };
}

export function chooseFollowSheep(state: GameState, resolution?: TurnResolution): Entity | null {
    if (state.sheep.length === 0) return null;
    if (!resolution) return state.sheep[0];
    const movementByKey = new Map(resolution.movements.map((movement) => [movement.key, movement]));
    return [...state.sheep].sort((left, right) => {
        const leftMove = movementByKey.get(left.key);
        const rightMove = movementByKey.get(right.key);
        const distance = (movement: typeof leftMove) => movement
            ? Math.abs(movement.to.row - movement.from.row) + Math.abs(movement.to.col - movement.from.col)
            : -1;
        return distance(rightMove) - distance(leftMove);
    })[0];
}
