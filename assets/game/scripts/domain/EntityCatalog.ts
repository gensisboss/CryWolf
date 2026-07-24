export const SHEEP_IDS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19] as const;
export const WOLF_IDS = [20, 21, 22, 23, 24, 25, 26, 27, 28, 29] as const;
export const OBSTACLE_IDS = [30, 31, 32, 33, 34, 35, 36, 37, 38, 39] as const;
export const TRAP_IDS = [40, 41, 42, 43, 44, 45, 46, 47, 48, 49] as const;
export const VILLAGE_IDS = [50, 51, 52, 53, 54, 55, 56, 57, 58, 59] as const;
export const BOX_IDS = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69] as const;

const sheepSet = new Set<number>(SHEEP_IDS);
const wolfSet = new Set<number>(WOLF_IDS);
const obstacleSet = new Set<number>(OBSTACLE_IDS);
const trapSet = new Set<number>(TRAP_IDS);
const villageSet = new Set<number>(VILLAGE_IDS);
const boxSet = new Set<number>(BOX_IDS);

export type TileKind = 'clear' | 'sheep' | 'wolf' | 'obstacle' | 'trap' | 'village' | 'box';

export function getTileKind(id: number): TileKind {
    if (sheepSet.has(id)) return 'sheep';
    if (wolfSet.has(id)) return 'wolf';
    if (obstacleSet.has(id)) return 'obstacle';
    if (trapSet.has(id)) return 'trap';
    if (villageSet.has(id)) return 'village';
    if (boxSet.has(id)) return 'box';
    return 'clear';
}

export function getVariantIndex(id: number): number {
    const kind = getTileKind(id);
    const groups: Partial<Record<TileKind, readonly number[]>> = {
        sheep: SHEEP_IDS,
        wolf: WOLF_IDS,
        obstacle: OBSTACLE_IDS,
        trap: TRAP_IDS,
        village: VILLAGE_IDS,
        box: BOX_IDS,
    };
    const group = groups[kind];
    return group ? Math.max(0, group.indexOf(id)) : 0;
}
