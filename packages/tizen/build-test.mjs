import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { deflateSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testDir = join(__dirname, 'test-app');
const output = join(__dirname, 'IPTV-Test.wgt');

const files = [
  { name: 'config.xml', data: readFileSync(join(testDir, 'config.xml')) },
  { name: 'index.html', data: readFileSync(join(testDir, 'index.html')) },
];

const zip = buildZip(files);
writeFileSync(output, zip);
console.log(`Created IPTV-Test.wgt (${(zip.length / 1024).toFixed(1)} KB)`);

function buildZip(entries) {
  let centralDir = Buffer.alloc(0);
  let offset = 0;
  const parts = [];

  for (const entry of entries) {
    const nameB = Buffer.from(entry.name, 'utf-8');
    const crc = crc32(entry.data);
    const compressed = deflateSync(entry.data, { level: 9 });

    // Local file header
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameB.length, 26);
    localHeader.writeUInt16LE(0, 28);

    parts.push(localHeader);
    parts.push(nameB);
    parts.push(compressed);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(entry.data.length, 24);
    cd.writeUInt16LE(nameB.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);

    centralDir = Buffer.concat([centralDir, cd, nameB]);
    offset += 30 + nameB.length + compressed.length;
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, centralDir, eocd]);
}

function crc32(data) {
  let c = 0xFFFFFFFF;
  for (let n = 0; n < data.length; n++) {
    c ^= data[n];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}
