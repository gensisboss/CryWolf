const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const outputDir = path.join(__dirname, '..', 'assets', 'resources', 'art');

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const value of buffer) {
        crc ^= value;
        for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const name = Buffer.from(type);
    const result = Buffer.alloc(data.length + 12);
    result.writeUInt32BE(data.length, 0);
    name.copy(result, 4);
    data.copy(result, 8);
    result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
    return result;
}

function roundedTexture(name, fill, border, radius = 12, borderWidth = 4) {
    const width = 64;
    const height = 64;
    const raw = Buffer.alloc((width * 4 + 1) * height);
    const inside = (x, y, inset) => {
        const r = Math.max(0, radius - inset);
        const left = inset; const right = width - 1 - inset;
        const bottom = inset; const top = height - 1 - inset;
        if (x < left || x > right || y < bottom || y > top) return false;
        const cx = x < left + r ? left + r : x > right - r ? right - r : x;
        const cy = y < bottom + r ? bottom + r : y > top - r ? top - r : y;
        return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;
    };
    for (let y = 0; y < height; y += 1) {
        const row = y * (width * 4 + 1);
        raw[row] = 0;
        for (let x = 0; x < width; x += 1) {
            const offset = row + 1 + x * 4;
            const color = inside(x, y, borderWidth) ? fill : inside(x, y, 0) ? border : [0, 0, 0, 0];
            raw[offset] = color[0]; raw[offset + 1] = color[1]; raw[offset + 2] = color[2]; raw[offset + 3] = color[3];
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; ihdr[9] = 6;
    const png = Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
    ]);
    const file = path.join(outputDir, `${name}.png`);
    fs.writeFileSync(file, png);
    const hash = crypto.createHash('sha1').update(`crywolf-ui:${name}`).digest('hex');
    const uuid = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
    const textureUuid = `${uuid}@6c48a`;
    const spriteUuid = `${uuid}@f9941`;
    const meta = {
        ver: '1.0.27', importer: 'image', imported: true, uuid, files: ['.json', '.png'],
        subMetas: {
            '6c48a': { importer: 'texture', uuid: textureUuid, displayName: name, id: '6c48a', name: 'texture', userData: { wrapModeS: 'clamp-to-edge', wrapModeT: 'clamp-to-edge', imageUuidOrDatabaseUri: uuid, isUuid: true, visible: false, minfilter: 'nearest', magfilter: 'nearest', mipfilter: 'none', anisotropy: 0 }, ver: '1.0.22', imported: true, files: ['.json'], subMetas: {} },
            'f9941': { importer: 'sprite-frame', uuid: spriteUuid, displayName: name, id: 'f9941', name: 'spriteFrame', userData: { trimType: 'none', trimThreshold: 1, rotated: false, offsetX: 0, offsetY: 0, trimX: 0, trimY: 0, width, height, rawWidth: width, rawHeight: height, borderTop: 16, borderBottom: 16, borderLeft: 16, borderRight: 16, packable: true, pixelsToUnit: 100, pivotX: 0.5, pivotY: 0.5, meshType: 0, isUuid: true, imageUuidOrDatabaseUri: textureUuid, atlasUuid: '' }, ver: '1.0.12', imported: true, files: ['.json'], subMetas: {} },
        },
        userData: { type: 'sprite-frame', hasAlpha: true, fixAlphaTransparencyArtifacts: false, redirect: textureUuid },
    };
    fs.writeFileSync(`${file}.meta`, `${JSON.stringify(meta, null, 2)}\n`);
}

roundedTexture('ui-panel-gold', [244, 214, 145, 255], [91, 61, 24, 255]);
roundedTexture('ui-panel-green', [72, 108, 57, 245], [255, 238, 165, 210]);
roundedTexture('ui-button-gold', [239, 200, 119, 255], [91, 61, 24, 255], 14, 4);
roundedTexture('ui-button-green', [69, 105, 57, 255], [255, 238, 165, 225], 14, 4);
roundedTexture('ui-status-gold', [244, 214, 145, 245], [91, 61, 24, 240], 10, 3);
roundedTexture('ui-status-green', [73, 110, 56, 245], [91, 61, 24, 240], 10, 3);
roundedTexture('ui-bar-dark', [48, 67, 39, 235], [255, 238, 165, 175], 12, 3);
roundedTexture('ui-dialog', [255, 246, 220, 255], [74, 52, 24, 245], 16, 4);
roundedTexture('ui-modal', [241, 213, 154, 255], [78, 55, 24, 245], 12, 4);
roundedTexture('ui-overlay', [28, 42, 24, 190], [28, 42, 24, 190], 0, 0);
