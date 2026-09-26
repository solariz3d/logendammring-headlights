// Read-only kn5 material dump: shader, flags and every ks* property per material.
const fs = require('fs');
const buf = fs.readFileSync(process.argv[2]);
let o = 0;
const i32 = () => { const v = buf.readInt32LE(o); o += 4; return v; };
const f32 = () => { const v = buf.readFloatLE(o); o += 4; return v; };
const u8 = () => buf[o++];
const str = () => { const n = i32(); const s = buf.toString('utf8', o, o + n); o += n; return s; };

if (buf.toString('latin1', 0, 6) !== 'sc6969') throw new Error('not a kn5');
o = 6;
const version = i32();
if (version > 5) i32();
const texCount = i32();
const textures = [];
for (let t = 0; t < texCount; t++) { i32(); const name = str(); const size = i32(); o += size; textures.push(name); }
const matCount = i32();
const mats = [];
for (let m = 0; m < matCount; m++) {
  const name = str(), shader = str();
  const alphaBlend = u8(), alphaTested = u8(), depthMode = i32();
  const props = {};
  const pc = i32();
  for (let p = 0; p < pc; p++) { const pn = str(); props[pn] = +f32().toFixed(3); o += 36; }
  const maps = [];
  const mc = i32();
  for (let p = 0; p < mc; p++) { const slot = str(); i32(); const tex = str(); maps.push(slot + '=' + tex); }
  mats.push({ name, shader, alphaBlend, alphaTested, depthMode, props, maps });
}
console.log(`kn5 v${version} · ${texCount} textures · ${matCount} materials · nodes start at byte ${o}`);
for (const m of mats) console.log(JSON.stringify(m));
