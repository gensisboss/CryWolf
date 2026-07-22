import { resources, SpriteFrame } from 'cc';
import { getTileKind, getVariantIndex } from '../domain/EntityCatalog';

const FILES = {
    mainBackground: 'main-bg',
    cloud: 'cloud-panel',
    hero: 'hero-main',
    guideGrandpa: 'guide-grandpa',
    startButton: 'button-start',
    homeButton: 'button-home',
    previousButton: 'button-last',
    nextButton: 'button-next',
    undoButton: 'button-undo',
    replayButton: 'button-replay',
    settingButton: 'button-setting',
    riverTile: 'river-tile',
    sheep: 'sheep',
    sheep2: 'sheep-2',
    sheep3: 'sheep-3',
    sheep4: 'sheep-4',
    sheep5: 'sheep-5',
    wolf: 'wolf',
    wolf2: 'wolf-2',
    wolf3: 'wolf-3',
    wolf4: 'wolf-4',
    wolf5: 'wolf-5',
    village: 'village',
    village2: 'village-2',
    village3: 'village-3',
    village4: 'village-4',
    obstacle: 'obstacle',
    obstacle2: 'obstacle-2',
    obstacle3: 'obstacle-3',
    obstacle4: 'obstacle-4',
    trap: 'trap',
    trap2: 'trap-2',
    trap3: 'trap-3',
    trap4: 'trap-4',
} as const;

export type AssetKey = keyof typeof FILES;

function loadSpriteFrame(file: string): Promise<SpriteFrame> {
    return new Promise((resolve, reject) => {
        resources.load(`art/${file}/spriteFrame`, SpriteFrame, (error, frame) => {
            if (error || !frame) {
                reject(error ?? new Error(`Missing sprite frame: ${file}`));
                return;
            }
            resolve(frame);
        });
    });
}

export class AssetCatalog {
    private readonly frames = new Map<AssetKey, SpriteFrame>();

    public async load(): Promise<void> {
        const entries = Object.entries(FILES) as Array<[AssetKey, string]>;
        const frames = await Promise.all(entries.map(([, file]) => loadSpriteFrame(file)));
        entries.forEach(([key], index) => this.frames.set(key, frames[index]));
    }

    public get(key: AssetKey): SpriteFrame {
        const frame = this.frames.get(key);
        if (!frame) throw new Error(`Sprite frame not loaded: ${key}`);
        return frame;
    }

    public forTile(id: number): SpriteFrame | null {
        const kind = getTileKind(id);
        if (kind === 'clear') return null;
        const variants: Record<Exclude<typeof kind, 'clear'>, AssetKey[]> = {
            sheep: ['sheep', 'sheep2', 'sheep3', 'sheep4', 'sheep5'],
            wolf: ['wolf', 'wolf2', 'wolf3', 'wolf4', 'wolf5'],
            village: ['village', 'village2', 'village3', 'village4'],
            obstacle: ['obstacle', 'obstacle2', 'obstacle3', 'obstacle4'],
            trap: ['trap', 'trap2', 'trap3', 'trap4'],
        };
        const available = variants[kind];
        return this.get(available[getVariantIndex(id) % available.length]);
    }
}
