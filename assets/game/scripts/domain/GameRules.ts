import { getTileKind } from './EntityCatalog';
import {
    DIRECTION_VECTORS,
    Direction,
    Entity,
    EntityKind,
    GameState,
    GameStatus,
    GridPosition,
    LevelDefinition,
    StaticEntity,
    TurnEvents,
    TurnResolution,
} from './GameTypes';

function positionKey(row: number, col: number): string {
    return `${row},${col}`;
}

function cloneEntity(entity: Entity): Entity {
    return { ...entity };
}

function cloneStaticEntity(entity: StaticEntity): StaticEntity {
    return { ...entity };
}

export function cloneGameState(state: GameState): GameState {
    return {
        ...state,
        level: {
            ...state.level,
            map: state.level.map.map((row) => [...row]),
        },
        sheep: state.sheep.map(cloneEntity),
        wolves: state.wolves.map(cloneEntity),
        obstacles: state.obstacles.map(cloneEntity),
        boxes: state.boxes.map(cloneEntity),
        villages: state.villages.map(cloneStaticEntity),
        traps: state.traps.map(cloneStaticEntity),
    };
}

export function createInitialState(level: LevelDefinition): GameState {
    const rows = level.map.length;
    const cols = rows > 0 ? level.map[0].length : 0;
    const sheep: Entity[] = [];
    const wolves: Entity[] = [];
    const obstacles: Entity[] = [];
    const boxes: Entity[] = [];
    const villages: StaticEntity[] = [];
    const traps: StaticEntity[] = [];
    let sequence = 0;

    const createEntity = (id: number, row: number, col: number, kind: EntityKind): Entity => ({
        id,
        row,
        col,
        kind,
        key: `${kind}-${sequence++}`,
    });

    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            const id = level.map[row][col];
            switch (getTileKind(id)) {
                case 'sheep':
                    sheep.push(createEntity(id, row, col, 'sheep'));
                    break;
                case 'wolf':
                    wolves.push(createEntity(id, row, col, 'wolf'));
                    break;
                case 'obstacle':
                    obstacles.push(createEntity(id, row, col, 'obstacle'));
                    break;
                case 'box':
                    boxes.push(createEntity(id, row, col, 'box'));
                    break;
                case 'village':
                    villages.push({ id, row, col });
                    break;
                case 'trap':
                    traps.push({ id, row, col });
                    break;
                default:
                    break;
            }
        }
    }

    return {
        level: {
            ...level,
            map: level.map.map((row) => [...row]),
        },
        rows,
        cols,
        goal: level.goal,
        escapedSheep: 0,
        sheep,
        wolves,
        obstacles,
        boxes,
        villages,
        traps,
        status: 'playing',
    };
}

function getStatus(escapedSheep: number, goal: number, sheepCount: number): GameStatus {
    if (escapedSheep >= goal) return 'win';
    if (sheepCount <= 0) return 'lose';
    return 'playing';
}

function chooseIndex(length: number, random: () => number): number {
    const value = random();
    const normalized = Number.isFinite(value) ? value : 0;
    return Math.min(length - 1, Math.max(0, Math.floor(normalized * length)));
}

export function resolveTurn(
    source: GameState,
    direction: Direction,
    random: () => number = Math.random,
): TurnResolution {
    if (source.status !== 'playing') {
        return {
            state: cloneGameState(source),
            movements: [],
            events: emptyEvents(),
        };
    }

    const [dr, dc] = DIRECTION_VECTORS[direction];
    const obstacleCells = new Set(source.obstacles.map((entity) => positionKey(entity.row, entity.col)));
    const boxCells = new Set(source.boxes.map((entity) => positionKey(entity.row, entity.col)));
    const villageCells = new Set(source.villages.map((entity) => positionKey(entity.row, entity.col)));
    const trapCells = new Set(source.traps.map((entity) => positionKey(entity.row, entity.col)));
    const moving = [
        ...source.sheep.map(cloneEntity),
        ...source.wolves.map(cloneEntity),
        ...source.boxes.map(cloneEntity),
    ];

    moving.sort((left, right) => {
        if (dc !== 0) return dc > 0 ? right.col - left.col : left.col - right.col;
        if (dr !== 0) return dr > 0 ? right.row - left.row : left.row - right.row;
        return 0;
    });

    const occupied = new Set<string>();
    const movements = [];

    for (const entity of moving) {
        const from = { row: entity.row, col: entity.col };
        let row = entity.row;
        let col = entity.col;
        if (entity.kind === 'box') {
            boxCells.delete(positionKey(row, col));
        }

        while (true) {
            const nextRow = row + dr;
            const nextCol = col + dc;
            if (nextRow < 0 || nextRow >= source.rows || nextCol < 0 || nextCol >= source.cols) break;

            const key = positionKey(nextRow, nextCol);
            const blocked = entity.kind === 'box'
                ? obstacleCells.has(key) || villageCells.has(key) || trapCells.has(key)
                : obstacleCells.has(key) || boxCells.has(key) || (entity.kind === 'wolf' && villageCells.has(key));
            if (blocked || occupied.has(key)) break;

            row = nextRow;
            col = nextCol;
            const shouldStop = entity.kind === 'sheep'
                ? trapCells.has(key) || villageCells.has(key)
                : entity.kind === 'wolf' && trapCells.has(key);
            if (shouldStop) break;
        }

        entity.row = row;
        entity.col = col;
        if (entity.kind === 'box') {
            boxCells.add(positionKey(row, col));
        }
        occupied.add(positionKey(row, col));
        movements.push({
            key: entity.key,
            id: entity.id,
            kind: entity.kind,
            from,
            to: { row, col },
        });
    }

    const sheepAtLanding = moving.filter((entity) => entity.kind === 'sheep').map(cloneEntity);
    const wolvesAtLanding = moving.filter((entity) => entity.kind === 'wolf').map(cloneEntity);
    const boxes = moving.filter((entity) => entity.kind === 'box').map(cloneEntity);
    const sheep: Entity[] = [];
    const wolves: Entity[] = [];
    const removedTrapCells = new Set<string>();
    const events = emptyEvents();

    for (const entity of sheepAtLanding) {
        const key = positionKey(entity.row, entity.col);
        if (villageCells.has(key)) {
            events.escaped.push(entity.key);
        } else if (trapCells.has(key)) {
            events.trappedSheep.push(entity.key);
            removedTrapCells.add(key);
        } else {
            sheep.push(entity);
        }
    }

    for (const entity of wolvesAtLanding) {
        const key = positionKey(entity.row, entity.col);
        if (trapCells.has(key)) {
            events.trappedWolves.push(entity.key);
            removedTrapCells.add(key);
        } else {
            wolves.push(entity);
        }
    }

    const reservedAttackCells = new Set<string>();
    for (const wolf of wolves) {
        const candidates = sheep.filter((candidate) => {
            const key = positionKey(candidate.row, candidate.col);
            const distance = Math.abs(wolf.row - candidate.row) + Math.abs(wolf.col - candidate.col);
            return distance === 1 && !reservedAttackCells.has(key);
        });
        if (candidates.length === 0) continue;

        const target = candidates[chooseIndex(candidates.length, random)];
        reservedAttackCells.add(positionKey(target.row, target.col));
        events.eaten.push(target.key);
        events.attacks.push({
            wolfKey: wolf.key,
            targetKey: target.key,
            targetId: target.id,
            from: { row: wolf.row, col: wolf.col },
            to: { row: target.row, col: target.col },
        });
        wolf.row = target.row;
        wolf.col = target.col;
    }

    const eatenKeys = new Set(events.eaten);
    const survivingSheep = sheep.filter((entity) => !eatenKeys.has(entity.key));
    const escapedSheep = source.escapedSheep + events.escaped.length;
    const state: GameState = {
        ...cloneGameState(source),
        escapedSheep,
        sheep: survivingSheep,
        wolves,
        obstacles: source.obstacles.map(cloneEntity),
        boxes,
        traps: source.traps.filter((trap) => !removedTrapCells.has(positionKey(trap.row, trap.col))).map(cloneStaticEntity),
        status: getStatus(escapedSheep, source.goal, survivingSheep.length),
    };

    return { state, movements, events };
}

function emptyEvents(): TurnEvents {
    return {
        escaped: [],
        eaten: [],
        trappedSheep: [],
        trappedWolves: [],
        attacks: [],
    };
}

export function gridPositionEquals(left: GridPosition, right: GridPosition): boolean {
    return left.row === right.row && left.col === right.col;
}
