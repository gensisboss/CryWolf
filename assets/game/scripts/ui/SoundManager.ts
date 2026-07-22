import { AudioClip, AudioSource, Node, resources } from 'cc';

export type SoundKey = 'click' | 'slide' | 'escape' | 'wolf' | 'eat' | 'death' | 'trap' | 'win' | 'lose' | 'transition' | 'undo' | 'guide';

const SOUND_KEYS: SoundKey[] = ['click', 'slide', 'escape', 'wolf', 'eat', 'death', 'trap', 'win', 'lose', 'transition', 'undo', 'guide'];

export class SoundManager {
    private readonly source: AudioSource;
    private readonly musicSource: AudioSource;
    private readonly clips = new Map<SoundKey, AudioClip>();
    private music: AudioClip | null = null;

    public constructor(host: Node) {
        const effectsNode = new Node('EffectAudio');
        const musicNode = new Node('BackgroundMusic');
        host.addChild(effectsNode);
        host.addChild(musicNode);
        this.source = effectsNode.addComponent(AudioSource);
        this.musicSource = musicNode.addComponent(AudioSource);
        this.musicSource.loop = true;
        this.musicSource.volume = 0.28;
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
        try {
            this.music = await new Promise<AudioClip>((resolve, reject) => {
                resources.load('audio/bgm', AudioClip, (error, asset) => {
                    if (error || !asset) reject(error ?? new Error('Missing background music'));
                    else resolve(asset);
                });
            });
        } catch {
            this.music = null;
        }
    }

    public play(key: SoundKey, volume = 1): void {
        this.playMusic();
        const clip = this.clips.get(key);
        if (clip) this.source.playOneShot(clip, volume);
    }

    public playMusic(): void {
        if (!this.music || this.musicSource.playing) return;
        this.musicSource.clip = this.music;
        this.musicSource.play();
    }
}
