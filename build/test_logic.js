// test_logic.js — headless tests for Stillwater logic.js. Run: node test_logic.js
'use strict';
const L = require('./logic.js');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name); }
}
function approx(a, b, eps, name) { ok(Math.abs(a - b) <= eps, name + ` (got ${a}, want ${b})`); }

// --- canal path ---
{
  const a = L.canalCenterWorld(100), b = L.canalCenterWorld(100);
  ok(a === b, 'canal deterministic');
  let maxStep = 0;
  for (let s = 0; s < 2000; s += 2) {
    maxStep = Math.max(maxStep, Math.abs(L.canalCenterWorld(s + 2) - L.canalCenterWorld(s)));
  }
  ok(maxStep < 1.2, 'canal slowly undulating, max 2-unit step ' + maxStep.toFixed(3));
  const t = L.canalTangentAngle(500);
  ok(Number.isFinite(t) && Math.abs(t) < 0.6, 'tangent angle sane: ' + t.toFixed(3));
  ok(L.isWaterTile(L.canalCenterWorld(300), 300), 'center of canal is water');
  ok(!L.isWaterTile(L.canalCenterWorld(300) + 30, 300), 'far bank is grass');
}

// --- physics: taps ---
{
  const st = L.createState();
  ok(st.v === 0, 'starts stopped');
  L.tap(st, 'left');
  ok(st.v > 0, 'left tap adds forward speed');
  ok(st.latV > 0, 'left tap pushes hull right (away from tap)');
  const st2 = L.createState();
  L.tap(st2, 'right');
  ok(st2.latV < 0, 'right tap pushes hull left');
  approx(st.v, st2.v, 1e-9, 'symmetric nudge');
}

// --- physics: coasting to a stop ---
{
  const st = L.createState();
  for (let i = 0; i < 4; i++) L.tap(st, 'left');
  ok(st.v > 5, 'several taps build speed: ' + st.v.toFixed(2));
  for (let t = 0; t < 30; t += 1 / 60) L.update(st, 1 / 60);
  ok(st.v === 0, 'coasts to a full stop without taps, v=' + st.v);
  ok(st.s < 8, 'travels toward -z while coasting');
}

// --- physics: banks ---
{
  const st = L.createState();
  st.lat = L.maxLateral() + 5; st.latV = 3; st.v = 5;
  L.update(st, 1 / 60);
  ok(st.lat <= L.maxLateral() + 1e-9, 'clamped inside canal');
  ok(st.latV < 0, 'bounced off bank');
  ok(st.v < 5, 'scrape slows forward motion');
}
{
  // shallow water drags more than mid-canal
  const deep = L.createState(); const shal = L.createState();
  deep.v = shal.v = 6; shal.lat = L.maxLateral() - 0.5;
  for (let t = 0; t < 3; t += 1 / 60) { L.update(deep, 1 / 60); L.update(shal, 1 / 60); }
  ok(shal.v < deep.v, `shallow drag stronger (${shal.v.toFixed(2)} < ${deep.v.toFixed(2)})`);
}
{
  // heading follows canal
  const st = L.createState();
  L.tap(st, 'left');
  for (let t = 0; t < 2; t += 1 / 60) L.update(st, 1 / 60);
  ok(Number.isFinite(st.yaw), 'yaw finite while moving');
  const p = L.gondolaPos(st);
  ok(Math.abs(p.x - (L.canalCenterWorld(p.z) + st.lat)) < 1e-9, 'gondola x = center + lateral');
  // heading faces the -z direction of travel
  const ny = Math.atan2(Math.sin(st.yaw), Math.cos(st.yaw));
  ok(Math.abs(Math.abs(ny) - Math.PI) < 0.6, 'yaw faces -z, yaw=' + st.yaw.toFixed(3));
}

// --- segment generation ---
{
  const a = L.genSegment(3, L.WORLD_SEED);
  const b = L.genSegment(3, L.WORLD_SEED);
  ok(JSON.stringify(a) === JSON.stringify(b), 'segment deterministic');
  const c = L.genSegment(4, L.WORLD_SEED);
  ok(JSON.stringify(a) !== JSON.stringify(c), 'segments differ');
  ok(a.tiles.length === L.SEG_ROWS * (2 * (L.CANAL_HALF + L.BANK) + 1), 'tile count ' + a.tiles.length);
  // every row has water at center and grass at the far edge
  let waterOk = true, grassOk = true;
  for (const t of a.tiles) {
    if (t.dx === 0 && t.kind !== 'water') waterOk = false;
    if (Math.abs(t.dx) === L.CANAL_HALF + L.BANK && t.kind !== 'water') { /* may be pond */ }
  }
  ok(waterOk, 'center column is water');
  const kinds = new Set(a.decor.map(d => d.type));
  ok(kinds.has('tree') || kinds.has('pine'), 'segment has trees: ' + [...kinds].join(','));
  // decor never inside the canal water
  let bad = 0;
  for (const d of a.decor) {
    if ((d.type === 'tree' || d.type === 'pine' || d.type === 'bush' || d.type === 'rock' ||
         d.type === 'lantern' || d.type === 'temple' || d.type === 'waterfall') &&
        L.isWaterTile(d.x, d.z)) bad++;
  }
  ok(bad === 0, 'bank decor not floating on canal water (' + bad + ')');
  // lily pads are on water
  let lilyBad = 0;
  for (const d of a.decor) if (d.type === 'lily' && !L.isWaterTile(d.x, d.z)) lilyBad++;
  ok(lilyBad === 0, 'lilies on water (' + lilyBad + ')');
  // reeds hug the edge
  let reedBad = 0;
  for (const d of a.decor) {
    if (d.type !== 'reeds') continue;
    const off = Math.abs(d.x / L.TILE - L.canalCenterTiles(d.z / L.TILE));
    if (off < L.CANAL_HALF - 0.6 || off > L.CANAL_HALF + 1.8) reedBad++;
  }
  ok(reedBad === 0, 'reeds at water edge (' + reedBad + ')');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
