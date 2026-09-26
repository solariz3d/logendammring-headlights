// check-track.js — a READ-ONLY lint for any Assetto Corsa kn5 (and, optionally, its CSP ext_config.ini).
// Opens both files for reading only and writes nothing anywhere.
//
//   node check-track.js <track.kn5> [ext_config.ini]
//
// Four checks, then a PASS/FAIL list. Exit code 1 if anything FAILS.
//   1. MATERIALS  — a material with ksDiffuse = 0 ignores every light but ambient (headlights included). Reported as
//                   FAIL unless the config's [SHADER_REPLACEMENT_*] gives it a ksDiffuse above 0.
//   2. NORMALS    — for every mesh, each triangle's face normal (from its positions and winding) against the three
//                   stored vertex normals; mean |dot| over all corners. Below 0.9 = the stored normals do not describe
//                   the surface, so lighting from them will look wrong. Road meshes (name /^\d*ROAD/) are listed apart.
//   3. INSIDE-OUT — mean SIGNED dot below −0.9: the normals point exactly against the faces.
//   4. CONFIG     — every material named in MATERIALS / GRASS_MATERIALS / OCCLUDING_MATERIALS / PUDDLES_MATERIALS
//                   (commented lines skipped) must exist in the kn5, or that line does nothing.
// kn5 v5/v6 node classes 1 (transform) and 2 (mesh); class 3 (skinned) stops the lint rather than being guessed at.
// The walk must end exactly at the file's last byte, or the lint refuses to report.
'use strict';
const fs = require('fs');

const DOT_MIN = 0.9, INSIDE_OUT = -0.9;
const ROAD = /^\d*ROAD/;

function readKn5(file) {
  const buf = fs.readFileSync(file);
  let o = 0;
  const i32 = () => { const v = buf.readInt32LE(o); o += 4; return v; };
  const f32 = () => { const v = buf.readFloatLE(o); o += 4; return v; };
  const str = () => { const n = i32(); const s = buf.toString('utf8', o, o + n); o += n; return s; };
  if (buf.toString('latin1', 0, 6) !== 'sc6969') throw new Error(`${file}: not a kn5`);
  o = 6;
  const version = i32();
  if (version > 5) i32();
  const texCount = i32();
  for (let t = 0; t < texCount; t++) { i32(); str(); const size = i32(); o += size; }
  const mats = [];
  const matCount = i32();
  for (let m = 0; m < matCount; m++) {
    const name = str(); str(); o += 2; i32();
    const props = {};
    const pc = i32();
    for (let p = 0; p < pc; p++) { const pn = str(); props[pn] = f32(); o += 36; }
    const mc = i32();
    for (let p = 0; p < mc; p++) { str(); i32(); str(); }
    mats.push({ name, props });
  }
  const meshes = [];
  (function node() {
    const cls = i32(), name = str(), childCount = i32();
    o += 1;
    if (cls === 1) o += 64;
    else if (cls === 2) {
      o += 3;
      const vc = i32();
      const P = new Float64Array(vc * 3), N = new Float64Array(vc * 3);
      for (let v = 0; v < vc; v++) {
        for (let d = 0; d < 3; d++) P[v * 3 + d] = f32();
        for (let d = 0; d < 3; d++) N[v * 3 + d] = f32();
        o += 20; // uv 2f, tangent 3f
      }
      const ic = i32();
      const I = new Uint32Array(ic);
      for (let k = 0; k < ic; k++) { I[k] = buf.readUInt16LE(o); o += 2; }
      const materialId = i32();
      o += 4 + 4 + 4 + 12 + 4 + 1;
      if (!mats[materialId]) throw new Error(`${file}: mesh "${name}" has material id ${materialId} out of range`);
      let abs = 0, signed = 0, n = 0;
      for (let k = 0; k + 2 < ic; k += 3) {
        const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3;
        if (I[k] >= vc || I[k + 1] >= vc || I[k + 2] >= vc) throw new Error(`${file}: mesh "${name}" index out of range`);
        const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
        const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
        let fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
        const fl = Math.hypot(fx, fy, fz);
        if (!(fl > 0)) continue;
        fx /= fl; fy /= fl; fz /= fl;
        for (const q of [a, b, c]) {
          const nl = Math.hypot(N[q], N[q + 1], N[q + 2]);
          if (!(nl > 0)) continue;
          const d = (fx * N[q] + fy * N[q + 1] + fz * N[q + 2]) / nl;
          abs += Math.abs(d); signed += d; n++;
        }
      }
      meshes.push({ name, material: mats[materialId].name, vertices: vc, triangles: ic / 3, absDot: n ? abs / n : null, signedDot: n ? signed / n : null });
    } else throw new Error(`${file}: node "${name}" has class ${cls}; not linted (3 = skinned mesh)`);
    for (let c = 0; c < childCount; c++) node();
  })();
  if (o !== buf.length) throw new Error(`${file}: the walk ended at byte ${o} of ${buf.length}; layout not understood, refusing to report`);
  return { version, mats, meshes, bytes: buf.length };
}

function readConfig(file) {
  const lists = [], diffuse = new Map();
  let section = '';
  const sr = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.replace(/;.*$/, '').trim();
    if (!line) continue;
    const s = /^\[(.+)\]$/.exec(line);
    if (s) { section = s[1]; continue; }
    const kv = /^([A-Z_0-9]+)\s*=\s*(.*)$/i.exec(line);
    if (!kv) continue;
    const [, key, value] = kv;
    if (/^(MATERIALS|GRASS_MATERIALS|OCCLUDING_MATERIALS|PUDDLES_MATERIALS)$/i.test(key)) {
      const names = value.split(',').map((x) => x.trim()).filter(Boolean);
      lists.push({ section, key, names });
      if (/^SHADER_REPLACEMENT/i.test(section) && /^MATERIALS$/i.test(key)) (sr[section] = sr[section] || {}).materials = names;
    }
    if (/^SHADER_REPLACEMENT/i.test(section) && /^PROP_\d+$/i.test(key)) {
      const [pn, pv] = value.split(',').map((x) => x.trim());
      if (/^ksDiffuse$/i.test(pn)) (sr[section] = sr[section] || {}).diffuse = +pv;
    }
    if (/^SHADER_REPLACEMENT/i.test(section) && /^ACTIVE$/i.test(key)) (sr[section] = sr[section] || {}).active = value !== '0';
  }
  for (const b of Object.values(sr)) if (b.active !== false && b.diffuse > 0 && b.materials) for (const m of b.materials) diffuse.set(m, b.diffuse);
  return { lists, diffuse };
}

function lint(kn5File, configFile) {
  const k = readKn5(kn5File);
  const cfg = configFile ? readConfig(configFile) : null;
  const names = new Set(k.mats.map((m) => m.name));
  const results = [];
  const add = (id, pass, title, items) => results.push({ id, pass, title, items });

  const zero = k.mats.filter((m) => m.props.ksDiffuse === 0);
  const covered = zero.filter((m) => cfg && cfg.diffuse.has(m.name));
  const bare = zero.filter((m) => !(cfg && cfg.diffuse.has(m.name)));
  add('MATERIALS', bare.length === 0, `ksDiffuse = 0: ${zero.length} of ${k.mats.length} materials in the kn5; ${covered.length} given diffuse by the config${cfg ? '' : ' (no config given)'}; ${bare.length} left ignoring light`,
    [...bare.map((m) => `ignores light: ${m.name} (ksAmbient ${fmt(m.props.ksAmbient)}, used by ${k.meshes.filter((x) => x.material === m.name).length} meshes)`),
      ...covered.map((m) => `fixed by config: ${m.name} → ksDiffuse ${cfg.diffuse.get(m.name)}`)]);

  const scored = k.meshes.filter((m) => m.absDot !== null);
  const road = scored.filter((m) => ROAD.test(m.name)), other = scored.filter((m) => !ROAD.test(m.name));
  const badRoad = road.filter((m) => m.absDot < DOT_MIN), badOther = other.filter((m) => m.absDot < DOT_MIN);
  add('NORMALS-ROAD', badRoad.length === 0, `road meshes (/^\\d*ROAD/) with stored normals disagreeing with their faces (|dot| < ${DOT_MIN}): ${badRoad.length} of ${road.length}${road.length ? ` · range ${fmt(Math.min(...road.map((m) => m.absDot)))}–${fmt(Math.max(...road.map((m) => m.absDot)))}` : ''}`,
    badRoad.map((m) => `${m.name} (${m.material}) |dot| ${fmt(m.absDot)}`));
  // AC_* / KS_* are the game's special objects (spawn points, timing gates, start lights). A small box with shared
  // corner vertices always averages its normals, so it scores about 0.5 here without anything being wrong. Tagged,
  // not excused: the check still FAILs on them, and the reader decides.
  const special = (n) => /^(AC_|KS_)/.test(n);
  add('NORMALS-OTHER', badOther.length === 0, `other meshes with |dot| < ${DOT_MIN}: ${badOther.length} of ${other.length}, of which ${badOther.filter((m) => special(m.name)).length} are AC_/KS_ game objects`,
    badOther.map((m) => `${m.name} (${m.material}) |dot| ${fmt(m.absDot)}${special(m.name) ? '  [AC_/KS_ game object: smooth-shaded box]' : ''}`));

  const inside = scored.filter((m) => m.signedDot < INSIDE_OUT);
  add('INSIDE-OUT', inside.length === 0, `meshes whose normals point against their faces (signed dot < ${INSIDE_OUT}): ${inside.length}`,
    inside.map((m) => `${m.name} (${m.material}, ${m.triangles} triangles) signed dot ${fmt(m.signedDot)}`));

  if (cfg) {
    const missing = [];
    for (const l of cfg.lists) for (const n of l.names) if (!names.has(n)) missing.push(`[${l.section}] ${l.key}: "${n}" is not a material in the kn5`);
    add('CONFIG-NAMES', missing.length === 0, `config material names that do not exist in the kn5: ${missing.length}`, missing);
  } else add('CONFIG-NAMES', true, 'no config given: skipped', []);

  return { kn5: kn5File, config: configFile || null, bytes: k.bytes, version: k.version, materials: k.mats.length, meshes: k.meshes.length, results };
}
const fmt = (x) => (x === undefined ? 'n/a' : (+x).toFixed(3));

if (require.main === module) {
  const [kn5, config] = process.argv.slice(2);
  if (!kn5) { console.error('usage: node check-track.js <track.kn5> [ext_config.ini]'); process.exit(2); }
  const r = lint(kn5, config);
  console.log(`check-track · ${r.kn5} · kn5 v${r.version} · ${r.bytes} bytes · ${r.materials} materials · ${r.meshes} meshes${r.config ? ` · config ${r.config}` : ''}`);
  for (const x of r.results) {
    console.log(`\n${x.pass ? 'PASS' : 'FAIL'}  ${x.id}: ${x.title}`);
    for (const i of x.items) console.log(`      - ${i}`);
  }
  const failed = r.results.filter((x) => !x.pass).map((x) => x.id);
  console.log(`\n${failed.length ? 'FAIL' : 'PASS'} — ${r.results.map((x) => `${x.id} ${x.pass ? 'PASS' : 'FAIL'}`).join(' · ')}`);
  process.exit(failed.length ? 1 : 0);
}
module.exports = { lint, readKn5, readConfig };
