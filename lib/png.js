// Tiny dependency-free PNG encoder used to draw the pass icon/logo images
// (Apple Wallet requires icon.png in every pass bundle).
const zlib = require("zlib");

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

/** Draws a rounded square of colour [r,g,b] with a white "gift ribbon" cross. */
function giftIcon(size, [r, g, b]) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const radius = size * 0.22;
  const band = Math.max(1, Math.round(size * 0.12));
  const mid = size / 2;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const o = y * (size * 4 + 1) + 1 + x * 4;
      // rounded-corner mask
      const cx = Math.min(Math.max(x + 0.5, radius), size - radius);
      const cy = Math.min(Math.max(y + 0.5, radius), size - radius);
      const inside = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= radius ** 2;
      if (!inside) { raw[o + 3] = 0; continue; }
      const ribbon = Math.abs(x + 0.5 - mid) < band / 2 || Math.abs(y + 0.5 - mid) < band / 2;
      raw[o] = ribbon ? 255 : r;
      raw[o + 1] = ribbon ? 255 : g;
      raw[o + 2] = ribbon ? 255 : b;
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

module.exports = { giftIcon };
