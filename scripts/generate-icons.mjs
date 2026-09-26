// Generates Silsila mark-only icons: three interlocking rings, matching BrandMark.
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
  const bg = [246, 243, 236],
    ink = [27, 26, 22],
    teal = [30, 107, 91];
  const rows = [];
  const S = 4;
  // Reference geometry is 112 x 56. Keep every stroke within the maskable safe circle.
  const scale = (size * (1 - padding)) / 112;
  for (let y = 0; y < size; y++) {
    const row = [0];
    for (let x = 0; x < size; x++) {
      const rgb = [0, 0, 0];
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++) {
          const px = (x + (sx + 0.5) / S - size / 2) / scale + 56;
          const py = (y + (sy + 0.5) / S - size / 2) / scale + 28;
          let color = bg;
          for (const [cx, stroke] of [
            [29, ink],
            [56, teal],
            [83, ink],
          ]) {
            if (Math.abs(Math.hypot(px - cx, py - 28) - 22) <= 3)
              color = stroke;
          }
          const angle = Math.atan2(py - 28, px - 29);
          if (
            Math.abs(angle) <= 0.622 &&
            Math.abs(Math.hypot(px - 29, py - 28) - 22) <= 3
          )
            color = ink;
          for (let i = 0; i < 3; i++) rgb[i] += color[i];
        }
      row.push(...rgb.map((v) => Math.round(v / (S * S))), 255);
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
writeFileSync('public/icons/favicon-32.png', png(32, { padding: 0.05 }));
writeFileSync(
  'public/icons/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 112"><style>:root{--ink:#1b1a16;--accent:#1e6b5b;--bg:#f6f3ec}</style><rect width="112" height="112" rx="22" fill="var(--bg)"/><g transform="translate(0 28)" fill="none" stroke-width="6"><circle cx="29" cy="28" r="22" stroke="var(--ink)"/><circle cx="56" cy="28" r="22" stroke="var(--accent)"/><circle cx="83" cy="28" r="22" stroke="var(--ink)"/><path d="M46.9 15.2 A22 22 0 0 1 46.9 40.8" stroke="var(--ink)"/></g></svg>`,
);
console.log('Silsila icons written');
