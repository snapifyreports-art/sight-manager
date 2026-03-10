/**
 * Generate valid PNG icons for PWA manifest.
 * Uses only Node.js built-ins (no external dependencies).
 * Creates solid blue (#2563EB) squares with "SM" text rendered as pixels.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([length, typeBytes, data, crc]);
}

// Simple 5x7 pixel font for S and M
const FONT = {
  S: [
    [0,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,0],
    [0,1,1,1,0],
    [0,0,0,0,1],
    [1,0,0,0,1],
    [0,1,1,1,0],
  ],
  M: [
    [1,0,0,0,1],
    [1,1,0,1,1],
    [1,0,1,0,1],
    [1,0,1,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
  ],
};

function generatePNG(width, height, bgR, bgG, bgB, text) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // color type: RGB
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  const rowSize = 1 + width * 3;
  const rawData = Buffer.alloc(rowSize * height);

  // Fill background
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const pixOffset = rowOffset + 1 + x * 3;
      rawData[pixOffset] = bgR;
      rawData[pixOffset + 1] = bgG;
      rawData[pixOffset + 2] = bgB;
    }
  }

  // Draw rounded rectangle background (slightly darker blue for border feel)
  const margin = Math.floor(width * 0.08);
  const radius = Math.floor(width * 0.15);

  function inRoundedRect(px, py) {
    const x1 = margin, y1 = margin;
    const x2 = width - margin - 1, y2 = height - margin - 1;
    if (px < x1 || px > x2 || py < y1 || py > y2) return false;
    // Check corners
    const corners = [
      [x1 + radius, y1 + radius],
      [x2 - radius, y1 + radius],
      [x1 + radius, y2 - radius],
      [x2 - radius, y2 - radius],
    ];
    for (const [cx, cy] of corners) {
      const inCornerZone = (px < x1 + radius && py < y1 + radius) ||
                           (px > x2 - radius && py < y1 + radius) ||
                           (px < x1 + radius && py > y2 - radius) ||
                           (px > x2 - radius && py > y2 - radius);
      if (inCornerZone) {
        const dx = px - cx;
        const dy = py - cy;
        if (dx * dx + dy * dy > radius * radius) return false;
      }
    }
    return true;
  }

  // Draw a slightly lighter rounded rect as the main shape
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (inRoundedRect(x, y)) {
        const rowOffset = y * rowSize;
        const pixOffset = rowOffset + 1 + x * 3;
        // Use the primary blue
        rawData[pixOffset] = bgR;
        rawData[pixOffset + 1] = bgG;
        rawData[pixOffset + 2] = bgB;
      } else {
        // Transparent-ish (darker shade for outside rounded rect area)
        const rowOffset = y * rowSize;
        const pixOffset = rowOffset + 1 + x * 3;
        rawData[pixOffset] = Math.floor(bgR * 0.7);
        rawData[pixOffset + 1] = Math.floor(bgG * 0.7);
        rawData[pixOffset + 2] = Math.floor(bgB * 0.7);
      }
    }
  }

  // Draw text centered
  if (text) {
    const chars = text.split('');
    const charWidth = 5;
    const charHeight = 7;
    const spacing = 2;
    const totalTextWidth = chars.length * charWidth + (chars.length - 1) * spacing;

    const scale = Math.max(1, Math.floor(width * 0.35 / totalTextWidth));
    const scaledTextWidth = totalTextWidth * scale;
    const scaledTextHeight = charHeight * scale;

    const startX = Math.floor((width - scaledTextWidth) / 2);
    const startY = Math.floor((height - scaledTextHeight) / 2);

    let cursorX = startX;
    for (const ch of chars) {
      const glyph = FONT[ch];
      if (!glyph) { cursorX += (charWidth + spacing) * scale; continue; }

      for (let gy = 0; gy < charHeight; gy++) {
        for (let gx = 0; gx < charWidth; gx++) {
          if (glyph[gy][gx]) {
            for (let sy = 0; sy < scale; sy++) {
              for (let sx = 0; sx < scale; sx++) {
                const px = cursorX + gx * scale + sx;
                const py = startY + gy * scale + sy;
                if (px >= 0 && px < width && py >= 0 && py < height) {
                  const rowOffset = py * rowSize;
                  const pixOffset = rowOffset + 1 + px * 3;
                  rawData[pixOffset] = 255;
                  rawData[pixOffset + 1] = 255;
                  rawData[pixOffset + 2] = 255;
                }
              }
            }
          }
        }
      }
      cursorX += (charWidth + spacing) * scale;
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Generate icons
const outputDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outputDir, { recursive: true });

const icons = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'badge-72.png', size: 72 },
];

// Blue #2563EB = rgb(37, 99, 235)
const R = 37, G = 99, B = 235;

for (const icon of icons) {
  const png = generatePNG(icon.size, icon.size, R, G, B, 'SM');
  const outPath = path.join(outputDir, icon.name);
  fs.writeFileSync(outPath, png);
  console.log('Created ' + outPath + ' (' + icon.size + 'x' + icon.size + ', ' + png.length + ' bytes)');
}

console.log('\nAll icons generated successfully.');
