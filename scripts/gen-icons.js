/**
 * gen-icons.js — generate square PWA icons with no image dependencies.
 * Pure Node (zlib built-in). Draws a navy tile with a centered tennis ball.
 * Run: node scripts/gen-icons.js  →  public/icon-192.png, public/icon-512.png
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function png(S, rgb) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit, truecolor RGB
  const stride = S * 3;
  const raw = Buffer.alloc((stride + 1) * S);
  for (let y = 0; y < S; y++) rgb.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
function render(S) {
  const navy = [12, 23, 56], lime = [198, 232, 79], white = [245, 248, 255];
  const c = S / 2, ballR = S * 0.34, offset = ballR * 0.85, arcR = ballR * 1.28, thick = Math.max(1, ballR * 0.06);
  const buf = Buffer.alloc(S * S * 3);
  const ss = 3; // supersample for smooth edges
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const px = x + (sx + 0.5) / ss, py = y + (sy + 0.5) / ss;
        const d = Math.hypot(px - c, py - c);
        let col = navy;
        if (d <= ballR) {
          col = lime;
          const dl = Math.hypot(px - (c - offset), py - c);
          const dr = Math.hypot(px - (c + offset), py - c);
          if (Math.abs(dl - arcR) < thick || Math.abs(dr - arcR) < thick) col = white;
        }
        r += col[0]; g += col[1]; b += col[2];
      }
      const n = ss * ss, i = (y * S + x) * 3;
      buf[i] = Math.round(r / n); buf[i + 1] = Math.round(g / n); buf[i + 2] = Math.round(b / n);
    }
  }
  return buf;
}

const outDir = path.join(__dirname, '..', 'public');
for (const S of [192, 512]) {
  fs.writeFileSync(path.join(outDir, `icon-${S}.png`), png(S, render(S)));
  console.log('wrote public/icon-' + S + '.png');
}
