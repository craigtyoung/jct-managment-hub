/**
 * gen-icons-from-logo.js — build PWA + favicon icons from the JCT logo PNG.
 * Pure Node (zlib built-in, no image deps). Decodes public/jct-icon-source.png
 * (8-bit RGBA), composites it onto the navy brand tile, box-downsamples, and
 * writes public/icon-192.png, public/icon-512.png, public/favicon.png.
 *
 * Update the logo: replace public/jct-icon-source.png, then run:
 *   node scripts/gen-icons-from-logo.js
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const NAVY = [12, 23, 56]; // #0c1738 — matches manifest theme/background

// ---- PNG encode (truecolor RGB, matches gen-icons.js) ----
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
function encodePNG(S, rgb) {
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

// ---- PNG decode (8-bit RGBA, non-interlaced) ----
function decodeRGBA(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  const W = buf.readUInt32BE(16), H = buf.readUInt32BE(20);
  const bitDepth = buf[24], colorType = buf[25], interlace = buf[28];
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0)
    throw new Error(`unsupported PNG (bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace}); expected 8-bit RGBA non-interlaced`);
  // collect IDAT
  let p = 33, idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); const type = buf.toString('ascii', p + 4, p + 8);
    if (type === 'IDAT') idat.push(buf.slice(p + 8, p + 8 + len));
    if (type === 'IEND') break;
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = W * bpp;
  const out = Buffer.alloc(H * stride);
  const paeth = (a, b, c) => {
    const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
    return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
  };
  for (let y = 0; y < H; y++) {
    const ft = raw[y * (stride + 1)];
    const rowIn = y * (stride + 1) + 1, rowOut = y * stride, prevOut = rowOut - stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[rowIn + x];
      const a = x >= bpp ? out[rowOut + x - bpp] : 0;
      const b = y > 0 ? out[prevOut + x] : 0;
      const c = (y > 0 && x >= bpp) ? out[prevOut + x - bpp] : 0;
      let r;
      switch (ft) {
        case 0: r = v; break;
        case 1: r = v + a; break;
        case 2: r = v + b; break;
        case 3: r = v + ((a + b) >> 1); break;
        case 4: r = v + paeth(a, b, c); break;
        default: throw new Error('bad filter ' + ft);
      }
      out[rowOut + x] = r & 0xff;
    }
  }
  return { W, H, data: out };
}

// composite RGBA onto navy → opaque RGB (kills alpha fringe on the transparent corners)
function flattenOntoNavy(src) {
  const { W, H, data } = src;
  const rgb = Buffer.alloc(W * H * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    const a = data[i + 3] / 255;
    rgb[j]     = Math.round(data[i]     * a + NAVY[0] * (1 - a));
    rgb[j + 1] = Math.round(data[i + 1] * a + NAVY[1] * (1 - a));
    rgb[j + 2] = Math.round(data[i + 2] * a + NAVY[2] * (1 - a));
  }
  return { W, H, rgb };
}

// box-average downsample opaque RGB → S×S
function downsample(srcRGB, W, H, S) {
  const out = Buffer.alloc(S * S * 3);
  for (let oy = 0; oy < S; oy++) {
    const y0 = Math.floor(oy * H / S), y1 = Math.max(y0 + 1, Math.floor((oy + 1) * H / S));
    for (let ox = 0; ox < S; ox++) {
      const x0 = Math.floor(ox * W / S), x1 = Math.max(x0 + 1, Math.floor((ox + 1) * W / S));
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * W + x) * 3; r += srcRGB[i]; g += srcRGB[i + 1]; b += srcRGB[i + 2]; n++;
        }
      }
      const o = (oy * S + ox) * 3;
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n);
    }
  }
  return out;
}

const pub = path.join(__dirname, '..', 'public');
const src = decodeRGBA(fs.readFileSync(path.join(pub, 'jct-icon-source.png')));
const flat = flattenOntoNavy(src);
console.log(`source ${flat.W}x${flat.H}`);
for (const S of [512, 192, 64]) {
  const rgb = downsample(flat.rgb, flat.W, flat.H, S);
  const name = S === 64 ? 'favicon.png' : `icon-${S}.png`;
  fs.writeFileSync(path.join(pub, name), encodePNG(S, rgb));
  console.log('wrote public/' + name);
}
