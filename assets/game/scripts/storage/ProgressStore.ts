import { sys } from 'cc';
import { LevelDefinition } from '../domain/GameTypes';
import { normalizeLevels } from '../domain/LevelEditorRules';

interface KeyValueStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

const PROGRESS_KEY = 'slideweb-max-unlocked-level';
const GUIDE_KEY = 'slideweb-guide-seen-levels';
const CUSTOM_LEVEL_KEY = 'crywolf-custom-level';

export class ProgressStore {
    public constructor(private readonly storage: KeyValueStorage = sys.localStorage) {}

    public loadMaxUnlockedLevel(): number {
        try {
            const value = Number(this.storage.getItem(PROGRESS_KEY));
            return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
        } catch {
            return 0;
        }
    }

    public saveMaxUnlockedLevel(levelIndex: number): void {
        try {
            this.storage.setItem(PROGRESS_KEY, String(Math.max(0, Math.floor(levelIndex))));
        } catch {
            // Platform storage may be unavailable in preview or private mode.
        }
    }

    public loadSeenGuideLevels(): Set<number> {
        try {
            const parsed = JSON.parse(this.storage.getItem(GUIDE_KEY) ?? '[]');
            if (!Array.isArray(parsed)) return new Set<number>();
            return new Set(parsed
                .map(Number)
                .filter(Number.isFinite)
                .map(Math.floor));
        } catch {
            return new Set<number>();
        }
    }

    public saveSeenGuideLevels(levels: Set<number>): void {
        try {
            this.storage.setItem(GUIDE_KEY, JSON.stringify([...levels]));
        } catch {
            // Ignore storage failures and keep the in-memory session state.
        }
    }

    public saveCustomLevel(level: LevelDefinition): void {
        try {
            this.storage.setItem(CUSTOM_LEVEL_KEY, JSON.stringify(level));
        } catch {
            // Saving to clipboard can still succeed when local storage does not.
        }
    }

    public loadCustomLevel(): LevelDefinition | null {
        try {
            const raw = this.storage.getItem(CUSTOM_LEVEL_KEY);
            if (!raw) return null;
            return normalizeLevels([JSON.parse(raw)])[0] ?? null;
        } catch {
            return null;
        }
    }
}
