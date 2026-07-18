import { SHEEP_IDS } from './EntityCatalog';
import { LevelDefinition } from './GameTypes';

export const MIN_EDITOR_SIZE = 1;
export const MAX_EDITOR_SIZE = Number.MAX_SAFE_INTEGER;

export function createEmptyMap(rows = 6, cols = 6): number[][] {
    return Array.from({ length: rows }, () => Array<number>(cols).fill(0));
}

export function cloneMap(map: number[][]): number[][] {
    return map.map((row) => [...row]);
}

export function clampEditorSize(value: number, fallback: number): number {
    const normalized = Number.isFinite(value) ? Math.floor(value) : fallback;
    return Math.min(MAX_EDITOR_SIZE, Math.max(MIN_EDITOR_SIZE, normalized));
}

export function resizeMap(map: number[][], rows: number, cols: number): number[][] {
    const next = createEmptyMap(rows, cols);
    for (let row = 0; row < Math.min(rows, map.length); row += 1) {
        for (let col = 0; col < Math.min(cols, map[row].length); col += 1) {
            next[row][col] = map[row][col];
        }
    }
    return next;
}

export function placeTile(map: number[][], row: number, col: number, id: number): number[][] {
    const next = cloneMap(map);
    if (row >= 0 && row < next.length && col >= 0 && col < (next[0]?.length ?? 0)) {
        next[row][col] = id;
    }
    return next;
}

export function countSheep(map: number[][]): number {
    const ids = new Set<number>(SHEEP_IDS);
    return map.flat().filter((id) => ids.has(id)).length;
}

export function buildLevel(
    map: number[][],
    goal = 1,
    moveObstacle: number | boolean = 0,
    title = '',
): LevelDefinition {
    const normalizedTitle = typeof title === 'string' ? title.trim() : '';
    return {
        ...(normalizedTitle ? { title: normalizedTitle } : {}),
        goal: Math.max(1, Math.floor(Number(goal) || 1)),
        moveObstacle: Number(moveObstacle) === 1 ? 1 : 0,
        map: cloneMap(map),
    };
}

function isMap(value: unknown): value is number[][] {
    return Array.isArray(value)
        && value.length > 0
        && value.every((row) => Array.isArray(row) && row.length > 0 && row.every(Number.isFinite));
}

export function normalizeLevels(source: unknown): LevelDefinition[] {
    const record = source && typeof source === 'object' ? source as { levels?: unknown } : null;
    const declaredLevels = record?.levels;
    const sourceLevels = Array.isArray(declaredLevels) ? declaredLevels : source;
    if (!Array.isArray(sourceLevels)) return [];

    return sourceLevels.flatMap((item): LevelDefinition[] => {
        if (isMap(item)) {
            return [buildLevel(item, countSheep(item))];
        }
        if (!item || typeof item !== 'object') return [];
        const candidate = item as { map?: unknown; goal?: unknown; moveObstacle?: unknown; title?: unknown };
        if (!isMap(candidate.map)) return [];
        const width = candidate.map[0].length;
        if (candidate.map.some((row) => row.length !== width)) return [];
        return [buildLevel(
            candidate.map,
            Number(candidate.goal) || countSheep(candidate.map),
            Number(candidate.moveObstacle),
            typeof candidate.title === 'string' ? candidate.title : '',
        )];
    });
}

export function exportLevelJson(level: LevelDefinition): string {
    return JSON.stringify({
        ...(level.title ? { title: level.title.trim() } : {}),
        goal: Math.max(1, Math.floor(Number(level.goal) || 1)),
        moveObstacle: Number(level.moveObstacle) === 1 ? 1 : 0,
        map: cloneMap(level.map),
    }, null, 2);
}
