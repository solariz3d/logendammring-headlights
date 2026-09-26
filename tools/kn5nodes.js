// Read-only kn5 node-tree reader. Opens the kn5 for READING only; writes nothing anywhere.
//
//   node kn5nodes.js <file.kn5>            per-mesh table (text)
//   node kn5nodes.js <file.kn5> --json     the same, as JSON
//
// Layout, after the header/textures/materials that kn5mats.js reads (the same code, repeated here so this file stands alone):
//   node := class:i32  name:str  childCount:i32  active:u8  <body>  child*childCount
//   class 1 (transform): matrix 16*f32 (row-major, translation in [12],[13],[14]; points transform as v*M)
//   class 2 (mesh):      castShadows u8, visible u8, transparent u8,
//                        vertexCount i32, vertices (pos 3f, normal 3f, uv 2f, tangent 3f = 44 bytes each),
//                        indexCount i32, indices u16*indexCount,
//                        materialId i32, layer i32, lodIn f32, lodOut f32, bsCenter 3f, bsRadius f32, renderable u8
//   class 3 (skinned mesh) is NOT parsed: the reader stops and says so, rather than guessing its layout.
// THE RELIABILITY CHECK: a correct parse ends exactly at the last byte of the file. Anything else is reported as a failure.
const fs = require('fs');
const file = process.argv[2];
const asJson = process.argv.includes('--json');
const buf = fs.readFileSync(file);
let o = 0;
const i32 = () => { const v = buf.readInt32LE(o); o += 4; return v; };
const u16 = () => { const v = buf.readUInt16LE(o); o += 2; return v; };
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
  const name = str(); str(); u8(); u8(); i32();
  const pc = i32();
  for (let p = 0; p < pc; p++) { str(); f32(); o += 36; }
  const maps = [];
  const mc = i32();
  for (let p = 0; p < mc; p++) { const slot = str(); i32(); const tex = str(); maps.push({ slot, tex }); }
  mats.push({ name, tex: (maps.find((x) => x.slot === 'txDiffuse') || {}).tex || '' });
}
const nodesStart = o;

const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const mul = (a, b) => { // a*b, row-major 4x4
  const r = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
  return r;
};
const isIdent = (m) => m.every((v, i) => Math.abs(v - IDENT[i]) < 1e-6);

const meshes = [];
const transforms = [];
function node(parentWorld, path) {
  const cls = i32();
  const name = str();
  const childCount = i32();
  const active = u8();
  let world = parentWorld;
  if (cls === 1) {
    const m = [];
    for (let k = 0; k < 16; k++) m.push(f32());
    world = mul(m, parentWorld);
    if (!isIdent(m)) transforms.push({ name, path, translation: [m[12], m[13], m[14]].map((v) => +v.toFixed(3)) });
  } else if (cls === 2) {
    const castShadows = u8(), visible = u8(), transparent = u8();
    const vc = i32();
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    let nyNeg = 0, nyPos = 0, nyZero = 0, nySum = 0, nxSum = 0, nzSum = 0, nLenSum = 0;
    let absNx = 0, absNy = 0, absNz = 0, absTx = 0, absTy = 0, absTz = 0;
    const W = world;
    const identW = isIdent(W);
    const P = new Float64Array(vc * 3), N = new Float64Array(vc * 3);
    for (let v = 0; v < vc; v++) {
      let x = f32(), y = f32(), z = f32();
      let nx = f32(), ny = f32(), nz = f32();
      o += 8; // uv
      const tx = f32(), ty = f32(), tz = f32(); // tangent — read to test for a swapped normal/tangent export
      absTx += Math.abs(tx); absTy += Math.abs(ty); absTz += Math.abs(tz);
      if (!identW) {
        const X = x * W[0] + y * W[4] + z * W[8] + W[12], Y = x * W[1] + y * W[5] + z * W[9] + W[13], Z = x * W[2] + y * W[6] + z * W[10] + W[14];
        x = X; y = Y; z = Z;
        const NX = nx * W[0] + ny * W[4] + nz * W[8], NY = nx * W[1] + ny * W[5] + nz * W[9], NZ = nx * W[2] + ny * W[6] + nz * W[10];
        nx = NX; ny = NY; nz = NZ;
      }
      P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z; N[v * 3] = nx; N[v * 3 + 1] = ny; N[v * 3 + 2] = nz;
      if (x < min[0]) min[0] = x; if (y < min[1]) min[1] = y; if (z < min[2]) min[2] = z;
      if (x > max[0]) max[0] = x; if (y > max[1]) max[1] = y; if (z > max[2]) max[2] = z;
      if (ny < 0) nyNeg++; else if (ny > 0) nyPos++; else nyZero++;
      nySum += ny; nxSum += nx; nzSum += nz; nLenSum += Math.hypot(nx, ny, nz);
      absNx += Math.abs(nx); absNy += Math.abs(ny); absNz += Math.abs(nz);
    }
    const ic = i32();
    let maxIndex = 0;
    const I = new Uint32Array(ic);
    for (let k = 0; k < ic; k++) { const ix = u16(); I[k] = ix; if (ix > maxIndex) maxIndex = ix; }
    // GEOMETRY vs STORED normals: each triangle's face normal from its positions (cross product, area-weighted, unit
    // after summing), compared with its three stored vertex normals. |faceNy| near 1 = the surface itself is flat-ish.
    let faceAbsNy = 0, faceNyPos = 0, faceNyNeg = 0, tris = 0, agreeSum = 0, agreeAbsSum = 0, agreeN = 0;
    if (maxIndex < vc) for (let k = 0; k + 2 < ic; k += 3) {
      const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      let fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      const fl = Math.hypot(fx, fy, fz);
      if (!(fl > 0)) continue;
      fx /= fl; fy /= fl; fz /= fl;
      tris++; faceAbsNy += Math.abs(fy); if (fy > 0) faceNyPos++; else if (fy < 0) faceNyNeg++;
      for (const q of [a, b, c]) {
        const nl = Math.hypot(N[q], N[q + 1], N[q + 2]);
        if (!(nl > 0)) continue;
        const d = (fx * N[q] + fy * N[q + 1] + fz * N[q + 2]) / nl;
        agreeSum += d; agreeAbsSum += Math.abs(d); agreeN++;
      }
    }
    const materialId = i32();
    const layer = i32();
    const lodIn = f32(), lodOut = f32();
    o += 12; // bounding sphere center
    const bsRadius = f32();
    const renderable = u8();
    if (vc > 0 && maxIndex >= vc) throw new Error(`mesh "${name}": index ${maxIndex} >= vertexCount ${vc} at byte ${o} — layout broken`);
    if (!mats[materialId]) throw new Error(`mesh "${name}": materialId ${materialId} out of range at byte ${o} — layout broken`);
    const size = max.map((v, k) => v - min[k]);
    meshes.push({
      name, path, material: mats[materialId].name, texture: mats[materialId].tex, vertices: vc, triangles: ic / 3,
      bboxMin: min.map((v) => +v.toFixed(2)), bboxMax: max.map((v) => +v.toFixed(2)), size: size.map((v) => +v.toFixed(2)),
      normalsYNeg: vc ? +(nyNeg / vc).toFixed(4) : 0, normalsYPos: vc ? +(nyPos / vc).toFixed(4) : 0, meanNormalY: vc ? +(nySum / vc).toFixed(3) : 0,
      meanNormal: vc ? [nxSum, nySum, nzSum].map((s) => +(s / vc).toFixed(3)) : null,
      meanAbsNormal: vc ? [absNx, absNy, absNz].map((s) => +(s / vc).toFixed(3)) : null,
      meanNormalLength: vc ? +(nLenSum / vc).toFixed(3) : 0,
      meanAbsTangentLocal: vc ? [absTx, absTy, absTz].map((s) => +(s / vc).toFixed(3)) : null, // local space, untransformed
      faceMeanAbsNy: tris ? +(faceAbsNy / tris).toFixed(3) : null, faceNyPosShare: tris ? +(faceNyPos / tris).toFixed(3) : null,
      faceNyNegShare: tris ? +(faceNyNeg / tris).toFixed(3) : null,
      storedVsFaceDot: agreeN ? +(agreeSum / agreeN).toFixed(3) : null, storedVsFaceAbsDot: agreeN ? +(agreeAbsSum / agreeN).toFixed(3) : null,
      castShadows, visible, transparent, renderable, active, layer, lodIn: +lodIn.toFixed(1), lodOut: +lodOut.toFixed(1), bsRadius: +bsRadius.toFixed(1),
      worldTransformIdentity: identW,
    });
  } else {
    throw new Error(`node "${name}" has class ${cls} at byte ${o} — not parsed (3 = skinned mesh); stopping rather than guessing`);
  }
  for (let c = 0; c < childCount; c++) node(world, path + '/' + name);
}
node(IDENT, '');
const result = { file, bytes: buf.length, version, textures: texCount, materials: matCount, nodesStart, parseEnd: o, endsExactly: o === buf.length, meshes: meshes.length, nonIdentityTransforms: transforms, meshList: meshes };
if (asJson) { console.log(JSON.stringify(result, null, 1)); }
else {
  console.log(`kn5 v${version} · ${buf.length} bytes · nodes ${nodesStart}..${o} · ends exactly at EOF: ${o === buf.length} · ${meshes.length} meshes · ${transforms.length} non-identity transforms`);
  for (const t of transforms) console.log(`  transform ${t.path}/${t.name} translation ${t.translation}`);
  for (const m of meshes) console.log([m.name, m.material, m.texture, `v${m.vertices}`, `t${m.triangles}`, `size ${m.size}`, `min ${m.bboxMin}`, `max ${m.bboxMax}`, `nY<0 ${m.normalsYNeg}`, `meanNY ${m.meanNormalY}`, `vis${m.visible} rend${m.renderable} sh${m.castShadows}`].join(' | '));
}
