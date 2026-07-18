const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const sampleRate = 22050;
const outputDir = path.join(__dirname, '..', 'assets', 'resources', 'audio');
fs.mkdirSync(outputDir, { recursive: true });

let seed = 0x51f15e;
function noise() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff * 2 - 1;
}

function tone(duration, render) {
    const count = Math.floor(duration * sampleRate);
    const pcm = Buffer.alloc(count * 2);
    for (let index = 0; index < count; index += 1) {
        const time = index / sampleRate;
        const attack = Math.min(1, time / 0.012);
        const release = Math.min(1, (duration - time) / Math.min(0.09, duration * 0.35));
        const value = Math.max(-1, Math.min(1, render(time, duration) * attack * release));
        pcm.writeInt16LE(Math.round(value * 32767), index * 2);
    }
    const header = Buffer.alloc(44);
    header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
    header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
    header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([header, pcm]);
}

const sine = (frequency, time) => Math.sin(Math.PI * 2 * frequency * time);
const sounds = {
    click: tone(0.10, (t) => 0.24 * sine(620 + 1600 * t, t)),
    slide: tone(0.22, (t, d) => 0.14 * noise() * (1 - t / d) + 0.12 * sine(260 - 90 * t / d, t)),
    escape: tone(0.34, (t) => 0.22 * sine(t < 0.11 ? 660 : t < 0.22 ? 880 : 1100, t)),
    wolf: tone(0.36, (t, d) => 0.24 * sine(190 - 70 * t / d, t) + 0.08 * noise()),
    win: tone(0.68, (t) => {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        return 0.20 * sine(notes[Math.min(3, Math.floor(t / 0.16))], t);
    }),
    lose: tone(0.58, (t) => 0.20 * sine(t < 0.18 ? 392 : t < 0.36 ? 311 : 233, t)),
    transition: tone(0.48, (t, d) => 0.12 * noise() * Math.sin(Math.PI * t / d) + 0.10 * sine(300 + 700 * t / d, t)),
    undo: tone(0.28, (t, d) => 0.18 * sine(760 - 430 * t / d, t)),
    guide: tone(0.24, (t) => 0.16 * sine(t < 0.12 ? 740 : 988, t)),
};

for (const [name, wav] of Object.entries(sounds)) {
    const file = path.join(outputDir, `${name}.wav`);
    fs.writeFileSync(file, wav);
    const uuid = crypto.createHash('sha1').update(`crywolf-audio:${name}`).digest('hex');
    const formatted = `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(20, 32)}`;
    fs.writeFileSync(`${file}.meta`, `${JSON.stringify({
        ver: '1.0.9', importer: 'audio-clip', imported: true, uuid: formatted,
        files: ['.json', '.wav'], subMetas: {}, userData: { loadMode: 0 },
    }, null, 2)}\n`);
}
