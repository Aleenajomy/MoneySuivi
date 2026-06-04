const fs = require('fs');
const zlib = require('zlib');

function createPNG(size) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(type);
    const crcBuf = Buffer.concat([t, data]);
    let c = 0xffffffff;
    for (const b of crcBuf) {
      c ^= b;
      for (let i = 0; i < 8; i++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    const crc = Buffer.alloc(4); crc.writeUInt32BE((c ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, t, data, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Draw pixels
  const rows = [];
  const cx = size / 2, cy = size / 2, r = size / 2;

  for (let y = 0; y < size; y++) {
    const row = [0]; // filter byte
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const cornerR = size * 0.25;

      // Rounded rect background check
      const inCircle = dist <= r;
      const ax = Math.abs(dx), ay = Math.abs(dy);
      const inRect = ax <= r && ay <= r;
      const cornerX = r - cornerR, cornerY = r - cornerR;
      const inRoundedRect = inRect && (ax <= cornerX || ay <= cornerY ||
        Math.sqrt((ax - cornerX) ** 2 + (ay - cornerY) ** 2) <= cornerR);

      if (inRoundedRect) {
        // indigo background #6366F1
        row.push(99, 102, 241);
      } else {
        // transparent white background
        row.push(255, 255, 255);
      }
    }
    rows.push(Buffer.from(row));
  }

  // Draw ₹ symbol area (white bar in center)
  const barW = Math.floor(size * 0.08);
  const barH = Math.floor(size * 0.5);
  const bx = Math.floor(cx - barW / 2);
  const by = Math.floor(cy - barH / 2);

  for (let y = by; y < by + barH; y++) {
    for (let x = bx; x < bx + barW; x++) {
      const offset = 1 + x * 3;
      rows[y][offset] = 255;
      rows[y][offset + 1] = 255;
      rows[y][offset + 2] = 255;
    }
  }

  // Horizontal bars for ₹
  const hbarY1 = by + Math.floor(barH * 0.2);
  const hbarY2 = by + Math.floor(barH * 0.4);
  const hbarX = Math.floor(cx - size * 0.15);
  const hbarW = Math.floor(size * 0.3);
  for (let b = 0; b < 2; b++) {
    const hy = b === 0 ? hbarY1 : hbarY2;
    for (let hbw = 0; hbw < Math.floor(size * 0.08); hbw++) {
      for (let x = hbarX; x < hbarX + hbarW; x++) {
        const offset = 1 + x * 3;
        if (rows[hy + hbw]) {
          rows[hy + hbw][offset] = 255;
          rows[hy + hbw][offset + 1] = 255;
          rows[hy + hbw][offset + 2] = 255;
        }
      }
    }
  }

  const raw = Buffer.concat(rows);
  const compressed = zlib.deflateSync(raw);
  const idat = chunk('IDAT', compressed);
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, chunk('IHDR', ihdr), idat, iend]);
}

fs.writeFileSync('public/icon-192x192.png', createPNG(192));
fs.writeFileSync('public/icon-512x512.png', createPNG(512));
console.log('Icons generated: public/icon-192x192.png, public/icon-512x512.png');
