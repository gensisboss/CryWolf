import { JsonAsset, resources } from 'cc';
import { GuideDefinition, LevelDefinition } from '../domain/GameTypes';
import { normalizeLevels } from '../domain/LevelEditorRules';

function loadJson(path: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
        resources.load(path, JsonAsset, (error, asset) => {
            if (error || !asset) {
                reject(error ?? new Error(`Missing JSON resource: ${path}`));
                return;
            }
            resolve(asset.json);
        });
    });
}

function normalizeGuides(source: unknown): GuideDefinition[] {
    const record = source && typeof source === 'object' ? source as { guides?: unknown } : null;
    const declaredGuides = record?.guides;
    if (!Array.isArray(declaredGuides)) return [];

    return declaredGuides.flatMap((item): GuideDefinition[] => {
        if (!item || typeof item !== 'object') return [];
        const candidate = item as {
            level?: unknown;
            lines?: unknown;
            highlight?: { row?: unknown; col?: unknown };
        };
        const level = Math.floor(Number(candidate.level));
        const lines = Array.isArray(candidate.lines)
            ? candidate.lines.map((line) => String(line ?? '').trim()).filter(Boolean)
            : [];
        const row = Math.floor(Number(candidate.highlight?.row));
        const col = Math.floor(Number(candidate.highlight?.col));
        if (!Number.isFinite(level) || level < 1 || lines.length === 0) return [];
        if (!Number.isFinite(row) || !Number.isFinite(col) || row < 0 || col < 0) return [];
        return [{ level, lines, highlight: { row, col } }];
    });
}

export class GameDataRepository {
    public async loadLevels(): Promise<LevelDefinition[]> {
        return normalizeLevels(await loadJson('data/levels'));
    }

    public async loadGuides(): Promise<GuideDefinition[]> {
        return normalizeGuides(await loadJson('data/guides'));
    }
}
