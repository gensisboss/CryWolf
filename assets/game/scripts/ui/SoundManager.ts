import { AudioClip, AudioSource, Node, resources } from 'cc';

export type SoundKey = 'click' | 'slide' | 'escape' | 'wolf' | 'win' | 'lose' | 'transition' | 'undo' | 'guide';

const SOUND_KEYS: SoundKey[] = ['click', 'slide', 'escape', 'wolf', 'win', 'lose', 'transition', 'undo', 'guide'];

export class SoundManager {
    private readonly source: AudioSource;
    private readonly clips = new Map<SoundKey, AudioClip>();

    public constructor(host: Node) {
        this.source = host.getComponent(AudioSource) ?? host.addComponent(AudioSource);
    }

    public async load(): Promise<void> {
        await Promise.all(SOUND_KEYS.map(async (key) => {
            try {
                const clip = await new Promise<AudioClip>((resolve, reject) => {
                    resources.load(`audio/${key}`, AudioClip, (error, asset) => {
                        if (error || !asset) reject(error ?? new Error(`Missing sound: ${key}`));
                        else resolve(asset);
                    });
                });
                this.clips.set(key, clip);
            } catch {
                // Sound is optional and must never prevent the game from starting.
            }
        }));
    }

    public play(key: SoundKey, volume = 1): void {
        const clip = this.clips.get(key);
        if (clip) this.source.playOneShot(clip, volume);
    }
}
