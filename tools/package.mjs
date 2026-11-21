// Builds dist/lexiwisp-v<version>.zip — the file to attach to a GitHub Release
// (users unzip it and choose "Load unpacked", or upload it to the Chrome Web Store).
//
//   node tools/package.mjs
//
// No dependencies: writes a standard ZIP using Node's built-in zlib.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INCLUDE = ['manifest.json', 'icons', 'assets', 'src', 'data/dict'];

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const outDir = path.join(root, 'dist');
const outFile = path.join(outDir, `lexiwisp-v${manifest.version}.zip`);

function walk(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) throw new Error(`Missing ${rel}${rel === 'data/dict' ? ' (run tools/build-dictionary.mjs first)' : ''}`);
  if (fs.statSync(abs).isFile()) return [rel];
  return fs.readdirSync(abs).sort().flatMap((name) => walk(path.posix.join(rel, name)));
}

// DOS date/time used by the ZIP format.
function dosTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

const files = INCLUDE.flatMap(walk);
const now = dosTime(new Date());
const local = [];
const central = [];
let offset = 0;

for (const rel of files) {
  const data = fs.readFileSync(path.join(root, rel));
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  const useDeflate = deflated.length < data.length;
  const body = useDeflate ? deflated : data;
  const name = Buffer.from(rel, 'utf8');
  const crc = zlib.crc32(data);

  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4); // version needed
  lh.writeUInt16LE(0x0800, 6); // UTF-8 names
  lh.writeUInt16LE(useDeflate ? 8 : 0, 8);
  lh.writeUInt16LE(now.time, 10);
  lh.writeUInt16LE(now.date, 12);
  lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(body.length, 18);
  lh.writeUInt32LE(data.length, 22);
  lh.writeUInt16LE(name.length, 26);
  local.push(lh, name, body);

  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0);
  ch.writeUInt16LE(20, 4); // version made by
  ch.writeUInt16LE(20, 6);
  ch.writeUInt16LE(0x0800, 8);
  ch.writeUInt16LE(useDeflate ? 8 : 0, 10);
  ch.writeUInt16LE(now.time, 12);
  ch.writeUInt16LE(now.date, 14);
  ch.writeUInt32LE(crc, 16);
  ch.writeUInt32LE(body.length, 20);
  ch.writeUInt32LE(data.length, 24);
  ch.writeUInt16LE(name.length, 28);
  ch.writeUInt32LE(offset, 42);
  central.push(ch, name);

  offset += lh.length + name.length + body.length;
}

const centralSize = central.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, Buffer.concat([...local, ...central, end]));
console.log(`${path.relative(root, outFile)}  (${files.length} files, ${(fs.statSync(outFile).size / 1048576).toFixed(1)} MB)`);
