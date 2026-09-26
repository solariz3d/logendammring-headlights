// Build the release zip for Content Manager's drag-and-drop install:
//   dist/Lögendammring-headlights.zip
//     Lögendammring/Lögendammring.kn5              the patched copy (written by kn5normals.js into dist/)
//     Lögendammring/extension/ext_config.ini       the config from this repo
//     Lögendammring/ui/ui_track.json               the track's OWN ui_track.json, unchanged, read from --track
//
// WHY ui_track.json IS IN IT: Content Manager recognises a folder as a track only if it holds ui/ui_track.json
// (gro-ove/actools, AcManager.Tools/ContentInstallation/ContentScanner.cs, CheckDirectoryNodeForTrack: "It’s not a
// track"). Without it, a zip of just the kn5 and the config is not installed as a track at all. Its option "Update over
// existing files, keep UI information" skips ui_track.json (TrackContentEntry.cs, UiFilter), so this copy is only there
// to be recognised, never written over the player's own.
//   node tools/make-release.js --track "<the installed Lögendammring track folder>"
// All three inputs are checked against their expected sha256 first; a mismatch writes nothing.
// The zip is written here, not by PowerShell's Compress-Archive, so the "ö" in the names is stored as UTF-8 with the
// zip UTF-8 flag set (general purpose bit 11) — Windows PowerShell 5.1's Compress-Archive is not reliable for that.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'Lögendammring-headlights.zip');
const ti = process.argv.indexOf('--track');
if (ti < 0 || !process.argv[ti + 1]) { console.error('usage: node tools/make-release.js --track <the installed Lögendammring track folder>'); process.exit(2); }
const TRACK_DIR = process.argv[ti + 1];
const ENTRIES = [
  { from: path.join(ROOT, 'dist', 'Lögendammring.kn5'), as: 'Lögendammring/Lögendammring.kn5', sha256: 'daba83d03fe1981e13e566130e7e7974b25d9add9890dd6a85a071d75146c2c7' },
  { from: path.join(ROOT, 'extension', 'ext_config.ini'), as: 'Lögendammring/extension/ext_config.ini', sha256: '05b9fb19a3510d3d56f244207c5e1e62b9768f45e0610342e2a2c52dd5cd8be9' },
  { from: path.join(TRACK_DIR, 'ui', 'ui_track.json'), as: 'Lögendammring/ui/ui_track.json', sha256: '26e63b0ae61c1f16c67f5f7c19045585a02a2d807ec7ec8a044fadad50bc3ae2' },
];

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function zip(entries) {
  const parts = [], central = [];
  let offset = 0;
  const FLAG_UTF8 = 0x0800, DEFLATE = 8, TIME = 0, DATE = (2026 - 1980) << 9 | 9 << 5 | 26; // 2026-09-26, fixed so builds are reproducible
  for (const e of entries) {
    const name = Buffer.from(e.as, 'utf8');
    const data = e.data, crc = crc32(data), comp = zlib.deflateRawSync(data, { level: 9 });
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(FLAG_UTF8, 6); local.writeUInt16LE(DEFLATE, 8);
    local.writeUInt16LE(TIME, 10); local.writeUInt16LE(DATE, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    parts.push(local, name, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(FLAG_UTF8, 8); c.writeUInt16LE(DEFLATE, 10);
    c.writeUInt16LE(TIME, 12); c.writeUInt16LE(DATE, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(name.length, 28); c.writeUInt16LE(0, 30); c.writeUInt16LE(0, 32); c.writeUInt16LE(0, 34); c.writeUInt16LE(0, 36); c.writeUInt32LE(0, 38); c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += local.length + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
for (const e of ENTRIES) {
  e.data = fs.readFileSync(e.from);
  if (sha(e.data) !== e.sha256) { console.error(`refusing: ${e.from} is sha256 ${sha(e.data)}, expected ${e.sha256}`); process.exit(1); }
}
const z = zip(ENTRIES);
fs.writeFileSync(OUT, z);
console.log(`wrote ${OUT} · ${z.length} bytes · sha256 ${sha(z)}`);
for (const e of ENTRIES) console.log(`  ${e.as} · ${e.data.length} bytes · sha256 ${e.sha256}`);
