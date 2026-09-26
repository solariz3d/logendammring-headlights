// Recompute the road's vertex normals in a COPY of a kn5. The input file is only ever READ.
//
//   node kn5normals.js <in.kn5> <out.kn5>          write the patched copy (refuses if out exists or out == in)
//   node kn5normals.js --check <in.kn5> <out.kn5>  prove what changed: same size, every changed byte inside a road
//                                                  mesh's normal fields, every other mesh byte-identical
//
// LAYOUT — the same kn5 v6 layout kn5nodes.js reads (header, textures, materials, then the node tree; see its header
// comment). A mesh vertex is 44 bytes: position 3f @0, NORMAL 3f @12, uv 2f @24, tangent 3f @32. Normals are rewritten
// IN PLACE as float32, so the file size never changes. Like kn5nodes.js, the walk must end exactly at the last byte of
// the file, or nothing is written.
//
// WHAT IS RECOMPUTED: every mesh whose name matches /^\d*ROAD/, except SKIP (below).
//   1. Each triangle's face normal from its positions (cross product; its length is twice the area, so summing it is
//      area weighting). Winding decides the side, exactly as the renderer's does.
//   2. Vertices that share a POSITION inside a mesh (UV seams split one corner into several vertices) are grouped, so the
//      seam stays smooth.
//   3. THE GUARD: for each vertex, its own face-average is taken first (the faces that use this vertex). Then, from all
//      faces touching its position, only those within 60° of that own-average are summed. A road surface vertex next to
//      a vertical edge therefore keeps the surface's normal instead of rounding into the edge.
//   Normals are computed and written in the mesh's LOCAL space, which is what the file stores.
//   Tangents are NOT touched: no material in this track has a normal map, so nothing reads them for lighting.
//
// SKIP: 1ROAD_MainTrack.042 — a 12-triangle box whose normals point exactly against its winding (an inside-out box).
// Recomputing would turn it the right way out, which changes what it is, not how it is lit; left for the author.
'use strict';
const fs = require('fs');
const path = require('path');

const ROAD = /^\d*ROAD/;
const SKIP = new Set(['1ROAD_MainTrack.042']);
const GUARD_COS = Math.cos((60 * Math.PI) / 180);
const VSTRIDE = 44, NORMAL_AT = 12;

/** Walk the kn5 and return every mesh's byte offsets. Throws unless the walk ends exactly at EOF. */
function layout(buf) {
  let o = 0;
  const i32 = () => { const v = buf.readInt32LE(o); o += 4; return v; };
  const str = () => { const n = i32(); const s = buf.toString('utf8', o, o + n); o += n; return s; };
  if (buf.toString('latin1', 0, 6) !== 'sc6969') throw new Error('not a kn5');
  o = 6;
  const version = i32();
  if (version > 5) i32();
  const texCount = i32();
  for (let t = 0; t < texCount; t++) { i32(); str(); const size = i32(); o += size; }
  const matCount = i32();
  for (let m = 0; m < matCount; m++) {
    str(); str(); o += 2; i32();
    const pc = i32();
    for (let p = 0; p < pc; p++) { str(); o += 4 + 36; }
    const mc = i32();
    for (let p = 0; p < mc; p++) { str(); i32(); str(); }
  }
  const nodesStart = o;
  const meshes = [];
  function node() {
    const start = o;
    const cls = i32();
    const name = str();
    const childCount = i32();
    o += 1; // active
    if (cls === 1) o += 64;
    else if (cls === 2) {
      o += 3; // castShadows, visible, transparent
      const vc = i32();
      const vStart = o;
      o += vc * VSTRIDE;
      const ic = i32();
      const iStart = o;
      o += ic * 2;
      o += 4 + 4 + 4 + 4 + 12 + 4 + 1; // materialId, layer, lodIn, lodOut, bsCenter, bsRadius, renderable
      meshes.push({ name, start, end: o, vStart, vc, iStart, ic });
    } else throw new Error(`node "${name}" has class ${cls} at byte ${start}; not parsed`);
    for (let c = 0; c < childCount; c++) node();
  }
  node();
  if (o !== buf.length) throw new Error(`walk ended at ${o}, file is ${buf.length} bytes: layout not understood, nothing written`);
  return { version, nodesStart, meshes };
}

/** New normals for one mesh. Returns { normals: Float64Array(vc*3) | null per vertex kept, guarded, kept }. */
function recompute(buf, m) {
  const P = new Float64Array(m.vc * 3), key = new Array(m.vc);
  for (let v = 0; v < m.vc; v++) {
    const at = m.vStart + v * VSTRIDE;
    P[v * 3] = buf.readFloatLE(at); P[v * 3 + 1] = buf.readFloatLE(at + 4); P[v * 3 + 2] = buf.readFloatLE(at + 8);
    key[v] = buf.toString('hex', at, at + 12); // exact position, bit for bit
  }
  const I = new Array(m.ic);
  for (let k = 0; k < m.ic; k++) I[k] = buf.readUInt16LE(m.iStart + k * 2);
  const F = [], vf = Array.from({ length: m.vc }, () => []);
  for (let k = 0, f = 0; k + 2 < m.ic; k += 3) {
    const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const len = Math.hypot(n[0], n[1], n[2]);
    if (!(len > 0)) continue; // a zero-area triangle has no side
    F.push({ n, u: n.map((x) => x / len) });
    for (const q of [I[k], I[k + 1], I[k + 2]]) vf[q].push(F.length - 1);
    f++;
  }
  const groups = new Map();
  for (let v = 0; v < m.vc; v++) { const g = groups.get(key[v]); if (g) g.push(v); else groups.set(key[v], [v]); }
  const out = new Float64Array(m.vc * 3);
  let guarded = 0, kept = 0;
  const keep = new Uint8Array(m.vc);
  for (const members of groups.values()) {
    const groupFaces = [...new Set(members.flatMap((v) => vf[v]))];
    for (const v of members) {
      if (!vf[v].length) { keep[v] = 1; kept++; continue; } // a vertex no triangle uses keeps what it had
      const own = [0, 0, 0];
      for (const f of vf[v]) for (let d = 0; d < 3; d++) own[d] += F[f].n[d];
      const ol = Math.hypot(own[0], own[1], own[2]);
      if (!(ol > 0)) { keep[v] = 1; kept++; continue; }
      const s = [0, 0, 0];
      let excluded = 0;
      for (const f of groupFaces) {
        const u = F[f].u;
        if ((u[0] * own[0] + u[1] * own[1] + u[2] * own[2]) / ol >= GUARD_COS) for (let d = 0; d < 3; d++) s[d] += F[f].n[d];
        else excluded++;
      }
      if (excluded) guarded++;
      const sl = Math.hypot(s[0], s[1], s[2]);
      if (!(sl > 0)) { keep[v] = 1; kept++; continue; }
      for (let d = 0; d < 3; d++) out[v * 3 + d] = s[d] / sl;
    }
  }
  return { out, keep, guarded, kept, faces: F.length, groups: groups.size };
}

function write(inFile, outFile) {
  if (path.resolve(inFile) === path.resolve(outFile)) throw new Error('refusing: the output is the input');
  if (fs.existsSync(outFile)) throw new Error(`refusing: ${outFile} exists`);
  const src = fs.readFileSync(inFile);            // read-only; the input is never opened for writing
  const buf = Buffer.from(src);                   // the copy is edited in memory
  const L = layout(buf);
  const report = { in: inFile, out: outFile, bytes: buf.length, roadMeshes: 0, skipped: [], vertices: 0, rewritten: 0, guarded: 0, kept: 0, perMesh: [] };
  for (const m of L.meshes) {
    if (!ROAD.test(m.name)) continue;
    if (SKIP.has(m.name)) { report.skipped.push(m.name); continue; }
    report.roadMeshes++;
    const r = recompute(buf, m);
    for (let v = 0; v < m.vc; v++) {
      if (r.keep[v]) continue;
      const at = m.vStart + v * VSTRIDE + NORMAL_AT;
      buf.writeFloatLE(r.out[v * 3], at); buf.writeFloatLE(r.out[v * 3 + 1], at + 4); buf.writeFloatLE(r.out[v * 3 + 2], at + 8);
    }
    report.vertices += m.vc; report.rewritten += m.vc - r.kept; report.guarded += r.guarded; report.kept += r.kept;
    report.perMesh.push({ name: m.name, vertices: m.vc, faces: r.faces, positionGroups: r.groups, guarded: r.guarded, kept: r.kept });
  }
  if (buf.length !== src.length) throw new Error('size changed; nothing written');
  fs.writeFileSync(outFile, buf, { flag: 'wx' });
  return report;
}

/** Every changed byte must be inside a rewritten road mesh's normal fields; everything else identical. */
function check(inFile, outFile) {
  const a = fs.readFileSync(inFile), b = fs.readFileSync(outFile);
  const r = { sameSize: a.length === b.length, headerIdentical: false, changedBytes: 0, changedOutsideNormals: 0, nonRoadMeshes: 0, nonRoadIdentical: 0, skippedIdentical: [] };
  if (!r.sameSize) return r;
  const La = layout(a), Lb = layout(b);
  r.headerIdentical = a.subarray(0, La.nodesStart).equals(b.subarray(0, Lb.nodesStart)) && La.nodesStart === Lb.nodesStart;
  const allowed = [];
  for (const m of La.meshes) {
    if (ROAD.test(m.name) && !SKIP.has(m.name)) for (let v = 0; v < m.vc; v++) allowed.push(m.vStart + v * VSTRIDE + NORMAL_AT);
    else {
      const same = a.subarray(m.start, m.end).equals(b.subarray(m.start, m.end));
      if (SKIP.has(m.name)) r.skippedIdentical.push({ name: m.name, identical: same });
      else { r.nonRoadMeshes++; if (same) r.nonRoadIdentical++; }
    }
  }
  const inNormal = new Uint8Array(a.length);
  for (const at of allowed) inNormal.fill(1, at, at + 12);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { r.changedBytes++; if (!inNormal[i]) r.changedOutsideNormals++; }
  r.normalFieldBytesAllowed = allowed.length * 12;
  return r;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === '--check') console.log(JSON.stringify(check(args[1], args[2]), null, 1));
  else if (args.length === 2) {
    const r = write(args[0], args[1]);
    console.log(`wrote ${r.out} · ${r.bytes} bytes · ${r.roadMeshes} road meshes · skipped ${r.skipped.join(', ') || 'none'}`);
    console.log(`vertices ${r.vertices} · normals rewritten ${r.rewritten} · kept (no usable face) ${r.kept} · guard excluded a face at ${r.guarded} vertices`);
    if (args.includes('--verbose')) for (const m of r.perMesh) console.log(`  ${m.name}: v${m.vertices} f${m.faces} groups ${m.positionGroups} guarded ${m.guarded} kept ${m.kept}`);
  } else { console.error('usage: kn5normals.js <in.kn5> <out.kn5> | --check <in.kn5> <out.kn5>'); process.exit(2); }
}
module.exports = { layout, recompute, check };
