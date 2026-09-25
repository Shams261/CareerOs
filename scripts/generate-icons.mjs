// Generates CareerOS PWA icons (PNG) with no image dependencies: brand tile + white "C" ring.
// Run: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};
function png(size, { padding }) {
  const bg = [0x24, 0x4e, 0x3b],
    fg = [0xf6, 0xfa, 0xef],
    accent = [0x9b, 0xc2, 0x6b];
  const rows = [];
  const S = 4; // supersampling for smooth edges
  const cx = size / 2,
    cy = size / 2,
    scale = (size / 2) * (1 - padding);
  const outer = 0.62 * scale,
    inner = 0.4 * scale,
    dot = 0.1 * scale;
  for (let y = 0; y < size; y++) {
    const row = [0];
    for (let x = 0; x < size; x++) {
      let a = 0,
        d = 0;
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++) {
          const px = x + (sx + 0.5) / S - cx,
            py = y + (sy + 0.5) / S - cy;
          const r = Math.hypot(px, py);
          const angle = Math.atan2(py, px);
          // Ring with an opening on the right (|angle| < 40°) forms a "C".
          if (
            r <= outer &&
            r >= inner &&
            Math.abs(angle) > (40 * Math.PI) / 180
          )
            a++;
          if (Math.hypot(px - outer * 0.78, py) <= dot) d++;
        }
      const t = a / (S * S),
        u = d / (S * S);
      row.push(
        ...[0, 1, 2].map((i) =>
          Math.round(bg[i] * (1 - t - u) + fg[i] * t + accent[i] * u),
        ),
        255,
      );
    }
    rows.push(Buffer.from(row));
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
writeFileSync('public/icons/icon-192.png', png(192, { padding: 0.1 }));
writeFileSync('public/icons/icon-512.png', png(512, { padding: 0.1 }));
// Maskable: keep the mark inside the 80% safe zone.
writeFileSync('public/icons/icon-maskable-512.png', png(512, { padding: 0.3 }));
writeFileSync('public/apple-touch-icon.png', png(180, { padding: 0.12 }));
console.log('icons written');
