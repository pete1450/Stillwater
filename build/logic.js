// logic.js — pure Stillwater logic: canal path, physics, segment generation.
// No THREE, no DOM. Runs in node for tests and in the browser.
'use strict';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- world constants ----
const TILE = 2;            // world units per tile
const CANAL_HALF = 3.5;    // canal half-width, in tiles
const BANK = 8;            // bank tiles drawn each side
const SEG_ROWS = 24;       // rows per segment
const SEG_LEN = SEG_ROWS * TILE;
const WORLD_SEED = 20260926;

// ---- canal path ----
// Slowly undulating centerline. st = distance in tiles.
function canalCenterTiles(st) {
  return 9 * Math.sin(st * 0.045)
       + 4 * Math.sin(st * 0.013 + 1.7)
       + 1.5 * Math.sin(st * 0.11 + 0.6);
}
function canalCenterWorld(s) { return canalCenterTiles(s / TILE) * TILE; }
function canalTangentAngle(s) {
  const e = 2;
  return Math.atan2(canalCenterWorld(s + e) - canalCenterWorld(s - e), 2 * e);
}
function isWaterTile(worldX, worldZ) {
  const zt = worldZ / TILE;
  const c = canalCenterTiles(Math.round(zt));
  return Math.abs(worldX / TILE - c) <= CANAL_HALF;
}

// ---- gondola physics ----
const PHYS = {
  nudge: 1.7,      // forward speed added per tap (units/s)
  push: 1.5,       // lateral speed added per tap, away from tapped side
  drag: 0.22,      // forward drag coefficient (low: long, lazy coasts)
  latDrag: 1.5,    // lateral drag coefficient
  maxSpeed: 5.5,
  shallowMul: 1.8, // extra drag in shallow water near banks
  bumpKeep: -0.35, // lateral velocity kept after bank bump
  scrape: 0.93,    // forward speed kept after bank scrape
};

function createState() {
  return { s: 8, lat: 0, v: 0, latV: 0, yaw: 0, bump: 0, taps: 0 };
}

// side: 'left' | 'right'. A left tap poles on the left, nudging forward
// and pushing the hull to the right (away from the tap).
function tap(st, side) {
  const dir = side === 'left' ? 1 : -1;
  st.v = Math.min(st.v + PHYS.nudge, PHYS.maxSpeed);
  st.latV += dir * PHYS.push;
  st.taps++;
  return { side, dir };
}

function maxLateral() { return CANAL_HALF * TILE - 1.3; }

function update(st, dt) {
  const shallow = Math.abs(st.lat) > CANAL_HALF * TILE - 2.6;
  const drag = PHYS.drag * (shallow ? PHYS.shallowMul : 1);
  st.v *= Math.exp(-drag * dt);
  if (st.v < 0.04) st.v = 0;
  st.latV *= Math.exp(-PHYS.latDrag * dt);
  if (Math.abs(st.latV) < 0.02) st.latV = 0;

  st.lat += st.latV * dt;
  const m = maxLateral();
  if (st.lat > m) {
    st.lat = m;
    if (st.latV > 0) { st.latV *= PHYS.bumpKeep; st.v *= PHYS.scrape; st.bump = 1; }
  } else if (st.lat < -m) {
    st.lat = -m;
    if (st.latV < 0) { st.latV *= PHYS.bumpKeep; st.v *= PHYS.scrape; st.bump = 1; }
  }

  st.s -= st.v * dt; // travel is toward -z
  // face the travel direction (path tangent + PI), crabbing slightly into lateral drift
  st.yaw = canalTangentAngle(st.s) + Math.PI - st.latV * 0.05;
  st.bump = Math.max(0, st.bump - dt * 2);
}

function gondolaPos(st) {
  return { x: canalCenterWorld(st.s) + st.lat, z: st.s };
}

// ---- segment generation (deterministic) ----
// A segment covers rows [segIdx*SEG_ROWS, (segIdx+1)*SEG_ROWS).
// Returns { segIdx, z0 (world), tiles: [{dx, dz, kind}], decor: [...] }.
// tile coords: dx in tiles relative to canal center of that row, dz in tiles (absolute row).
// decor entries carry world coords.
function genSegment(segIdx, seed) {
  const rng = mulberry32((seed ^ Math.imul(segIdx + 1, 7919)) >>> 0);
  const r0 = segIdx * SEG_ROWS;
  const tiles = [];
  const decor = [];
  const ponds = [];

  // ponds first (they recolor tiles)
  for (let r = 3; r < SEG_ROWS - 3; r++) {
    if (rng() < 0.022) {
      const side = rng() < 0.5 ? -1 : 1;
      ponds.push({
        type: 'pond',
        row: r0 + r,
        side,
        off: side * (CANAL_HALF + 2.5 + rng() * 2.5), // tiles from center
        rad: 2 + rng() * 1.4,
      });
    }
  }
  function pondAt(dx, row) {
    for (const p of ponds) {
      const ddx = dx - p.off, ddr = row - p.row;
      if (ddx * ddx + ddr * ddr <= p.rad * p.rad) return p;
    }
    return null;
  }

  for (let r = 0; r < SEG_ROWS; r++) {
    const row = r0 + r;
    for (let dx = -CANAL_HALF - BANK; dx <= CANAL_HALF + BANK; dx++) {
      let kind = Math.abs(dx) <= CANAL_HALF ? 'water' : 'grass';
      if (kind === 'grass' && pondAt(dx, row)) kind = 'water';
      tiles.push({ dx, row, kind });
    }
  }

  // clearing zones around temples (no trees)
  const clearings = [];

  for (let r = 0; r < SEG_ROWS; r++) {
    const row = r0 + r;
    const zW = row * TILE;
    const cx = canalCenterTiles(row);          // canal center, tiles
    const X = dx => (cx + dx) * TILE;          // tile-offset -> world x
    // water lilies
    if (rng() < 0.10) {
      const dx = (rng() * 2 - 1) * (CANAL_HALF - 0.8);
      decor.push({ type: 'lily', x: X(dx), z: zW, s: 0.7 + rng() * 0.7 });
    }
    // reeds at the water's edge
    for (const side of [-1, 1]) {
      if (rng() < 0.13) {
        const dx = side * (CANAL_HALF + 0.3 + rng() * 0.9);
        decor.push({ type: 'reeds', x: X(dx), z: zW + (rng() - 0.5) * TILE, s: 0.8 + rng() * 0.5 });
      }
      // lantern posts along the bank
      if (rng() < 0.045) {
        const dx = side * (CANAL_HALF + 1.2 + rng() * 1.5);
        decor.push({ type: 'lantern', x: X(dx), z: zW, s: 1 });
      }
    }
    // trees / bushes / rocks on the banks
    for (let dx = -CANAL_HALF - BANK; dx <= CANAL_HALF + BANK; dx++) {
      if (Math.abs(dx) <= CANAL_HALF + 0.6) continue;      // not in water
      if (pondAt(dx, row)) continue;                        // not in ponds
      if (clearings.some(c => Math.abs(row - c.row) < 5 && Math.abs(dx - c.off) < 5)) continue;
      const t = rng();
      if (t < 0.055) {
        decor.push({ type: rng() < 0.7 ? 'tree' : 'pine', x: X(dx), z: zW + (rng() - 0.5) * TILE, s: 0.8 + rng() * 0.6, v: rng() });
      } else if (t < 0.085) {
        decor.push({ type: 'bush', x: X(dx), z: zW + (rng() - 0.5) * TILE, s: 0.7 + rng() * 0.8, v: rng() });
      } else if (t < 0.095) {
        decor.push({ type: 'rock', x: X(dx), z: zW + (rng() - 0.5) * TILE, s: 0.6 + rng() * 0.9 });
      }
    }
    // waterfalls: a cliff on one bank spilling into the canal
    if (rng() < 0.010) {
      const side = rng() < 0.5 ? -1 : 1;
      const dx = side * (CANAL_HALF + 2.2);
      decor.push({ type: 'waterfall', x: X(dx), z: zW, side, s: 0.9 + rng() * 0.4 });
    }
    // temples: occasional shrine on a cleared bank
    if (rng() < 0.007) {
      const side = rng() < 0.5 ? -1 : 1;
      const off = side * (CANAL_HALF + 4.5);
      clearings.push({ row, off });
      decor.push({ type: 'temple', x: X(off), z: zW, side, s: 0.9 + rng() * 0.3 });
    }
  }
  // remove trees that landed inside clearings (placed before temple roll)
  const kept = decor.filter(d =>
    !(d.type === 'tree' || d.type === 'pine' || d.type === 'bush' || d.type === 'rock') ||
    !clearings.some(c => Math.abs(d.z / TILE - c.row) < 5 && Math.abs(d.x / TILE - c.off) < 5)
  );
  // lily pads on ponds
  for (const p of ponds) {
    const n = 2 + Math.floor(rng() * 3);
    const pcx = canalCenterTiles(p.row);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, rr = rng() * p.rad * 0.8;
      decor.push({ type: 'lily', x: (pcx + p.off + Math.cos(a) * rr) * TILE, z: (p.row + Math.sin(a) * rr) * TILE, s: 0.6 + rng() * 0.6 });
    }
  }

  return { segIdx, z0: r0 * TILE, tiles, decor, ponds };
}

if (typeof module !== 'undefined') {
  module.exports = {
    mulberry32, TILE, CANAL_HALF, BANK, SEG_ROWS, SEG_LEN, WORLD_SEED,
    canalCenterTiles, canalCenterWorld, canalTangentAngle, isWaterTile,
    PHYS, createState, tap, update, maxLateral, gondolaPos, genSegment,
  };
}
