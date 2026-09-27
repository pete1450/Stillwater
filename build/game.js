// game.js — Stillwater rendering + input. Browser only. Uses THREE (inlined)
// and the globals from logic.js. Three.js r147.
(function () {
'use strict';

// ============================== boot ==============================
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(1);
const PX = 3; // render at 1/3 res, upscale with chunky pixels

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf2a878, 70, 190);

const HALF_H = 24;
const VIEW_SHIFT = 0.25; // fraction of half-width the boat sits right of screen center
const camera = new THREE.OrthographicCamera(-1, 1, HALF_H, -HALF_H, 1, 500);
const ISO_OFF = new THREE.Vector3(34, 30, 34);

scene.add(new THREE.HemisphereLight(0xffd9a8, 0x3d6b5e, 0.95));
const sunLight = new THREE.DirectionalLight(0xffb36b, 0.85);
sunLight.position.set(-60, 35, -40);
scene.add(sunLight);

// sky gradient background
(function makeSky() {
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 512;
  const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0.0, '#d9774f');
  gr.addColorStop(0.45, '#f6a86b');
  gr.addColorStop(0.75, '#f9cf9a');
  gr.addColorStop(1.0, '#fbe3b8');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
  const tex = new THREE.CanvasTexture(cv);
  scene.background = tex;
})();

// soft radial glow texture (for lanterns, sun, mist, sparkles, fireflies)
const glowTex = (function () {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
})();

// scrolling streak texture for waterfalls
const streakTex = (function () {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 64, 128);
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 64, w = 1 + Math.random() * 3;
    g.fillStyle = 'rgba(255,255,255,' + (0.25 + Math.random() * 0.5).toFixed(2) + ')';
    g.fillRect(x, 0, w, 128);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();

function glowSprite(color, scale, opacity) {
  const m = new THREE.SpriteMaterial({
    map: glowTex, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const s = new THREE.Sprite(m);
  s.scale.set(scale, scale, 1);
  return s;
}

// ============================== shared geo/mat ==============================
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  ring: new THREE.RingGeometry(0.8, 1.0, 24),
  plane: new THREE.PlaneGeometry(1, 1),
};
const MAT = {
  water: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  grass: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  trunk: new THREE.MeshLambertMaterial({ color: 0x6b4a2f }),
  leaf: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  pine: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  rock: new THREE.MeshLambertMaterial({ color: 0x9b8e7e }),
  reed: new THREE.MeshLambertMaterial({ color: 0x5d8a4a }),
  lily: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  flower: new THREE.MeshLambertMaterial({ color: 0xe88aa0 }),
  post: new THREE.MeshLambertMaterial({ color: 0x4a3423 }),
  lampBox: new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
  waterSolid: new THREE.MeshLambertMaterial({ color: 0x2e7f79 }),
  stone: new THREE.MeshLambertMaterial({ color: 0xd9c2a3 }),
  roof: new THREE.MeshLambertMaterial({ color: 0xb5654d }),
  gold: new THREE.MeshBasicMaterial({ color: 0xffc95e }),
  falls: new THREE.MeshBasicMaterial({ map: streakTex, transparent: true, opacity: 0.8, color: 0xcfeee8, side: THREE.DoubleSide, depthWrite: false }),
  foam: new THREE.MeshBasicMaterial({ color: 0xfff6e8, transparent: true, opacity: 0.85 }),
  hull: new THREE.MeshLambertMaterial({ color: 0x16161e }),
  wood: new THREE.MeshLambertMaterial({ color: 0x6b4a2f }),
  seat: new THREE.MeshLambertMaterial({ color: 0xa33b3b }),
  skin: new THREE.MeshLambertMaterial({ color: 0xe8b88a }),
  shirtW: new THREE.MeshLambertMaterial({ color: 0xf3ead8 }),
  shirtR: new THREE.MeshLambertMaterial({ color: 0xc0392b }),
  hat: new THREE.MeshLambertMaterial({ color: 0xe3c878 }),
  silver: new THREE.MeshLambertMaterial({ color: 0xb9c2c9 }),
};

const _d = new THREE.Object3D();
const _c = new THREE.Color();
function setInst(mesh, i, x, y, z, o) {
  o = o || {};
  _d.position.set(x, y, z);
  _d.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
  _d.scale.set(o.sx == null ? 1 : o.sx, o.sy == null ? 1 : o.sy, o.sz == null ? 1 : o.sz);
  _d.updateMatrix();
  mesh.setMatrixAt(i, _d.matrix);
  if (o.col) mesh.setColorAt(i, o.col);
}
function box(parent, mat, x, y, z, sx, sy, sz, ry) {
  const m = new THREE.Mesh(GEO.box, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  if (ry) m.rotation.y = ry;
  parent.add(m);
  return m;
}
let _rs = 12345;
function rnd() { _rs = (_rs * 1103515245 + 12345) & 0x7fffffff; return _rs / 0x7fffffff; }

// ============================== segment builder ==============================
function buildSegment(segIdx) {
  const seg = genSegment(segIdx, WORLD_SEED);
  const group = new THREE.Group();

  // ---- tiles ----
  const waters = [], grasses = [];
  for (const t of seg.tiles) {
    const x = (canalCenterTiles(t.row) + t.dx) * TILE, z = t.row * TILE;
    (t.kind === 'water' ? waters : grasses).push([x, z]);
  }
  const waterMesh = new THREE.InstancedMesh(GEO.box, MAT.water, waters.length);
  for (let i = 0; i < waters.length; i++) {
    setInst(waterMesh, i, waters[i][0], -0.25, waters[i][1], { sx: TILE, sy: 0.5, sz: TILE });
    waterMesh.setColorAt(i, _c.setHSL(0.47 + rnd() * 0.05, 0.42, 0.3 + rnd() * 0.09));
  }
  const grassMesh = new THREE.InstancedMesh(GEO.box, MAT.grass, grasses.length);
  for (let i = 0; i < grasses.length; i++) {
    setInst(grassMesh, i, grasses[i][0], 0.2, grasses[i][1], { sx: TILE, sy: 1.4, sz: TILE });
    if (rnd() < 0.12) _c.setHSL(0.11, 0.5, 0.42 + rnd() * 0.08);
    else _c.setHSL(0.21 + rnd() * 0.05, 0.42, 0.36 + rnd() * 0.1);
    grassMesh.setColorAt(i, _c);
  }
  group.add(waterMesh, grassMesh);

  // ---- decor buckets ----
  const B = { tree: [], pine: [], bush: [], rock: [], reeds: [], lily: [], lantern: [] };
  const falls = [], temples = [];
  for (const d of seg.decor) {
    if (d.type === 'waterfall') falls.push(d);
    else if (d.type === 'temple') temples.push(d);
    else B[d.type].push(d);
  }
  function instanced(list, mat) {
    const m = new THREE.InstancedMesh(GEO.box, mat, Math.max(list.length, 1));
    m.count = list.length;
    return m;
  }

  // trees
  let m = instanced(B.tree, MAT.trunk);
  B.tree.forEach((d, i) => setInst(m, i, d.x, 0.9 + 0.8 * d.s, d.z, { sy: 1.6 * d.s, sx: 0.5 * d.s, sz: 0.5 * d.s }));
  group.add(m);
  m = instanced(B.tree, MAT.leaf);
  B.tree.forEach((d, i) => {
    setInst(m, i, d.x, 0.9 + 2.35 * d.s, d.z,
      { sx: 2.7 * d.s, sy: 2.1 * d.s, sz: 2.7 * d.s, ry: rnd() * 3 });
    if (rnd() < 0.16) _c.setHSL(0.07, 0.62, 0.4 + rnd() * 0.08);   // autumn accent
    else _c.setHSL(0.26 + rnd() * 0.07, 0.48, 0.28 + rnd() * 0.12);
    m.setColorAt(i, _c);
  });
  group.add(m);
  // pines
  m = instanced(B.pine, MAT.trunk);
  B.pine.forEach((d, i) => setInst(m, i, d.x, 0.9 + 0.7 * d.s, d.z, { sy: 1.4 * d.s, sx: 0.45 * d.s, sz: 0.45 * d.s }));
  group.add(m);
  m = instanced(B.pine, MAT.pine);
  B.pine.forEach((d, i) => {
    setInst(m, i, d.x, 0.9 + 2.7 * d.s, d.z, { sx: 2.0 * d.s, sy: 3.1 * d.s, sz: 2.0 * d.s, ry: rnd() * 3 });
    m.setColorAt(i, _c.setHSL(0.3 + rnd() * 0.04, 0.45, 0.24 + rnd() * 0.08));
  });
  group.add(m);
  // bushes / rocks
  m = instanced(B.bush, MAT.leaf);
  B.bush.forEach((d, i) => {
    setInst(m, i, d.x, 0.9 + 0.45 * d.s, d.z, { sx: 1.5 * d.s, sy: 1.0 * d.s, sz: 1.5 * d.s, ry: rnd() * 3 });
    m.setColorAt(i, _c.setHSL(0.25 + rnd() * 0.08, 0.5, 0.3 + rnd() * 0.12));
  });
  group.add(m);
  m = instanced(B.rock, MAT.rock);
  B.rock.forEach((d, i) => setInst(m, i, d.x, 0.9 + 0.25 * d.s, d.z,
    { sx: 1.3 * d.s, sy: 0.9 * d.s, sz: 1.3 * d.s, ry: rnd() * 3 }));
  group.add(m);
  // reeds: 3 blades per clump, rooted at the bank top
  m = new THREE.InstancedMesh(GEO.box, MAT.reed, Math.max(B.reeds.length * 3, 1));
  m.count = B.reeds.length * 3;
  B.reeds.forEach((d, j) => {
    for (let k = 0; k < 3; k++) {
      const a = rnd() * 6.28;
      setInst(m, j * 3 + k, d.x + Math.cos(a) * 0.4, 0.9 + 1.0 * d.s, d.z + Math.sin(a) * 0.4,
        { sx: 0.16, sy: 2.0 * d.s, sz: 0.16, rx: (rnd() - 0.5) * 0.25, rz: (rnd() - 0.5) * 0.25 });
    }
  });
  group.add(m);
  // lily pads (+ occasional flower)
  m = instanced(B.lily, MAT.lily);
  B.lily.forEach((d, i) => {
    setInst(m, i, d.x, 0.07, d.z, { sx: 1.1 * d.s, sy: 0.12, sz: 1.1 * d.s, ry: rnd() * 3 });
    m.setColorAt(i, _c.setHSL(0.32 + rnd() * 0.04, 0.5, 0.32 + rnd() * 0.1));
  });
  group.add(m);
  const flowers = B.lily.filter(() => rnd() < 0.3);
  m = instanced(flowers, MAT.flower);
  flowers.forEach((d, i) => setInst(m, i, d.x, 0.22, d.z, { sx: 0.35, sy: 0.28, sz: 0.35 }));
  group.add(m);
  // lantern posts + warm heads + glow sprites
  m = instanced(B.lantern, MAT.post);
  B.lantern.forEach((d, i) => setInst(m, i, d.x, 0.9 + 1.3, d.z, { sx: 0.25, sy: 2.6, sz: 0.25 }));
  group.add(m);
  m = instanced(B.lantern, MAT.lampBox);
  B.lantern.forEach((d, i) => setInst(m, i, d.x, 0.9 + 2.5, d.z, { sx: 0.55, sy: 0.6, sz: 0.55 }));
  group.add(m);
  for (const d of B.lantern) {
    const s = glowSprite(0xffc98a, 3.2, 0.55);
    s.position.set(d.x, 0.9 + 2.5, d.z);
    group.add(s);
  }

  // ---- waterfalls ----
  for (const d of falls) {
    const g = new THREE.Group();
    const fx = d.x - d.side * 3.3 * d.s; // cliff face toward the canal
    box(g, MAT.rock, d.x, 1.2 + 0.9, d.z, 6.5 * d.s, 2.4, 4.5 * d.s);
    box(g, MAT.rock, d.x + d.side * 0.4, 3.4 + 0.9, d.z, 5.4 * d.s, 2.2, 3.8 * d.s);
    box(g, MAT.rock, d.x + d.side * 0.8, 5.3 + 0.9, d.z, 4.2 * d.s, 2.0, 3.0 * d.s);
    box(g, MAT.waterSolid, d.x + d.side * 0.8, 6.35 + 0.9, d.z, 3.6 * d.s, 0.25, 2.6 * d.s); // top pool
    const w = 2.4 * d.s, h = 6.2;
    for (const off of [-0.9, 0.9]) {
      const p = new THREE.Mesh(GEO.plane, MAT.falls);
      p.scale.set(w * 0.55, h, 1);
      p.position.set(fx, h / 2 + 0.1, d.z + off * d.s);
      p.rotation.y = d.side > 0 ? -Math.PI / 2 : Math.PI / 2;
      g.add(p);
    }
    box(g, MAT.foam, fx - d.side * 0.6, 0.18, d.z, 2.6 * d.s, 0.22, 3.4 * d.s);
    const mist = glowSprite(0xdff2ec, 7, 0.4);
    mist.position.set(fx - d.side * 0.8, 1.6, d.z);
    g.add(mist);
    group.add(g);
  }

  // ---- temples ----
  for (const d of temples) {
    const g = new THREE.Group();
    const y0 = 0.9, s = d.s;
    box(g, MAT.stone, d.x, y0 + 0.5, d.z, 9 * s, 1, 9 * s);
    for (const px of [-3, 3]) for (const pz of [-3, 3])
      box(g, MAT.stone, d.x + px * s, y0 + 1 + 2.1 * s, d.z + pz * s, 0.9 * s, 4.2 * s, 0.9 * s);
    box(g, MAT.stone, d.x, y0 + 1 + 4.2 * s + 0.4 * s, d.z, 8 * s, 0.8 * s, 8 * s);
    box(g, MAT.roof, d.x, y0 + 1 + 4.2 * s + 0.8 * s + 0.45 * s, d.z, 8.8 * s, 0.9 * s, 8.8 * s);
    box(g, MAT.roof, d.x, y0 + 1 + 4.2 * s + 0.8 * s + 1.3 * s, d.z, 6.4 * s, 0.9 * s, 6.4 * s);
    box(g, MAT.roof, d.x, y0 + 1 + 4.2 * s + 0.8 * s + 2.15 * s, d.z, 4.0 * s, 0.9 * s, 4.0 * s);
    box(g, MAT.gold, d.x, y0 + 1 + 4.2 * s + 0.8 * s + 2.9 * s, d.z, 0.7 * s, 0.9 * s, 0.7 * s);
    // steps toward the canal
    box(g, MAT.stone, d.x - d.side * 5.2 * s, y0 + 0.25, d.z, 1.6 * s, 0.5, 3 * s);
    box(g, MAT.stone, d.x - d.side * 6.2 * s, y0 + 0.12, d.z, 1.2 * s, 0.25, 3 * s);
    // braziers flanking the steps, toward the canal
    for (const bz of [-2.2, 2.2]) {
      const bx = d.x - d.side * 5.6 * s, bzz = d.z + bz * s;
      box(g, MAT.post, bx, y0 + 0.8 * s, bzz, 0.5 * s, 1.6 * s, 0.5 * s);
      box(g, MAT.gold, bx, y0 + 1.75 * s, bzz, 0.45 * s, 0.5 * s, 0.45 * s);
      const gl = glowSprite(0xffb35e, 4.5, 0.6);
      gl.position.set(bx, y0 + 1.9 * s, bzz);
      g.add(gl);
    }
    group.add(g);
  }

  return { segIdx, group, waterMesh };
}

// ============================== segment manager ==============================
const segs = new Map();
function ensureSegments(s) {
  // window favors -z, the direction of travel
  const lo = Math.floor((s - 135) / SEG_LEN), hi = Math.floor((s + 50) / SEG_LEN);
  for (let i = lo; i <= hi; i++) {
    if (!segs.has(i)) {
      const sg = buildSegment(i);
      segs.set(i, sg);
      scene.add(sg.group);
    }
  }
  for (const [k, sg] of segs) {
    if (k < lo || k > hi) {
      scene.remove(sg.group);
      sg.group.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
      segs.delete(k);
    }
  }
}

// ============================== gondola ==============================
function buildGondola() {
  const g = new THREE.Group();
  // hull — long black voxel hull with raised bow/stern
  box(g, MAT.hull, 0, 0.4, 0, 1.8, 0.8, 3.4);
  box(g, MAT.hull, 0, 0.55, 2.45, 1.25, 0.8, 1.7);
  box(g, MAT.hull, 0, 0.95, 3.25, 0.7, 1.5, 0.7);   // prow
  box(g, MAT.hull, 0, 0.55, -2.35, 1.25, 0.8, 1.6);
  box(g, MAT.hull, 0, 0.85, -3.05, 0.7, 1.3, 0.7);  // stern post
  box(g, MAT.silver, 0, 1.35, 3.3, 0.18, 0.9, 0.5); // ferro
  box(g, MAT.wood, 0, 0.78, 0, 1.4, 0.14, 3.0);     // floor
  box(g, MAT.seat, 0, 0.95, 0.9, 1.1, 0.35, 0.9);   // seats
  box(g, MAT.seat, 0, 0.95, -0.5, 1.1, 0.35, 0.9);
  box(g, MAT.gold, 0.95, 0.75, 0, 0.12, 0.14, 3.4); // gunwale trim
  box(g, MAT.gold, -0.95, 0.75, 0, 0.12, 0.14, 3.4);
  // bow lantern
  box(g, MAT.post, 0, 1.5, 2.9, 0.16, 1.4, 0.16);
  box(g, MAT.lampBox, 0, 2.3, 2.9, 0.42, 0.5, 0.42);
  const lampGlow = glowSprite(0xffc98a, 3.4, 0.6);
  lampGlow.position.set(0, 2.3, 2.9);
  g.add(lampGlow);
  // gondolier at the stern
  const gz = -1.7;
  box(g, MAT.post, 0, 1.25, gz, 0.55, 0.9, 0.42);            // legs
  box(g, MAT.shirtW, 0, 1.95, gz, 0.72, 0.5, 0.46);          // torso stripes
  box(g, MAT.shirtR, 0, 2.25, gz, 0.72, 0.22, 0.46);
  box(g, MAT.shirtW, 0, 2.5, gz, 0.72, 0.22, 0.46);
  box(g, MAT.skin, 0, 2.85, gz, 0.46, 0.46, 0.46);           // head
  box(g, MAT.hat, 0, 3.12, gz, 0.5, 0.12, 0.5);              // straw hat
  box(g, MAT.hat, 0, 3.2, gz, 0.95, 0.07, 0.95);
  box(g, MAT.skin, 0.3, 2.35, gz + 0.25, 0.2, 0.2, 0.7);     // arms reaching
  box(g, MAT.skin, -0.3, 2.35, gz + 0.25, 0.2, 0.2, 0.7);
  // pole, pivoted at the hands. Rest: angled back, tip trailing at the surface.
  const pivot = new THREE.Group();
  pivot.position.set(0, 2.35, gz + 0.35);
  const pole = new THREE.Mesh(GEO.box, MAT.wood);
  pole.scale.set(0.14, 4.6, 0.14);
  pole.position.set(0, -1.5, 0);
  pivot.add(pole);
  const tip = new THREE.Object3D();
  tip.position.set(0, -3.8, 0); // pivot-space: the pole's lower end
  pivot.add(tip);
  const POLE_REST = 0.85;
  pivot.rotation.x = POLE_REST;
  g.add(pivot);
  return { group: g, pivot, tip, POLE_REST };
}
const gond = buildGondola();
scene.add(gond.group);

// pole push animation
let poleAnim = null;
function polePush(dir) { poleAnim = { t: 0, dir, rippled: false }; }
const _tipW = new THREE.Vector3();
function updatePole(dt) {
  if (!poleAnim) return;
  poleAnim.t += dt;
  const ph = poleAnim.t / 0.55;
  if (ph >= 1) {
    gond.pivot.rotation.z = 0;
    gond.pivot.rotation.x = gond.POLE_REST;
    poleAnim = null;
    return;
  }
  const c = Math.sin(Math.PI * ph);
  gond.pivot.rotation.z = poleAnim.dir * 0.9 * c;    // swing to the tapped side (boat faces -z)
  gond.pivot.rotation.x = gond.POLE_REST - 0.55 * c; // dip the tip down
  if (!poleAnim.rippled && ph > 0.45) {
    poleAnim.rippled = true;
    gond.tip.getWorldPosition(_tipW);
    spawnRipple(_tipW.x, _tipW.z);
  }
}

// ============================== ripples ==============================
const ripples = [];
for (let i = 0; i < 10; i++) {
  const m = new THREE.Mesh(GEO.ring, new THREE.MeshBasicMaterial({
    color: 0xfff2d8, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.07;
  m.visible = false;
  scene.add(m);
  ripples.push({ m, t: 1e9 });
}
function spawnRipple(x, z) {
  let r = ripples[0];
  for (const q of ripples) if (q.t > r.t) r = q;
  r.t = 0; r.m.position.x = x; r.m.position.z = z; r.m.visible = true;
}
function updateRipples(dt) {
  for (const r of ripples) {
    if (r.t > 1.2) { r.m.visible = false; continue; }
    r.t += dt;
    const k = Math.min(r.t / 1.2, 1);
    const s = 1 + k * 3.2;
    r.m.scale.set(s, s, 1);
    r.m.material.opacity = 0.65 * (1 - k);
  }
}

// ============================== sparkles / fireflies / shimmer / sun ==============================
const sparkles = [];
for (let i = 0; i < 46; i++) {
  const s = glowSprite(0xffe6b8, 0.55, 0.7);
  s.position.y = 0.09;
  s.userData = { ph: rnd() * 6.28, sp: 1 + rnd() * 2 };
  scene.add(s);
  sparkles.push(s);
}
function placeSparkle(s, gx, gz) {
  for (let tries = 0; tries < 12; tries++) {
    const x = gx + (rnd() - 0.5) * 90, z = gz + (rnd() - 0.5) * 90;
    if (isWaterTile(x, z)) { s.position.x = x; s.position.z = z; return; }
  }
  s.position.x = gx; s.position.z = gz;
}

const fireflies = [];
for (let i = 0; i < 30; i++) {
  const s = glowSprite(0xffd98a, 0.6, 0.6);
  s.userData = {
    bx: (rnd() - 0.5) * 70, by: 1.5 + rnd() * 4.5, bz: (rnd() - 0.5) * 70,
    ph: rnd() * 6.28, sp: 0.5 + rnd() * 1.2,
  };
  scene.add(s);
  fireflies.push(s);
}

const bands = [];
for (let i = 0; i < 3; i++) {
  const m = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({
    color: 0xffd9a8, transparent: true, opacity: 0.10,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  m.rotation.x = -Math.PI / 2;
  m.scale.set(5, 26, 1);
  m.position.y = 0.06;
  scene.add(m);
  bands.push({ m, off: i * 22 });
}

const sunCore = glowSprite(0xfff3d0, 42, 0.95);
const sunHalo = glowSprite(0xffb37a, 120, 0.5);
scene.add(sunCore, sunHalo);

// ============================== input ==============================
const state = createState();
const zoneL = document.getElementById('zoneL');
const zoneR = document.getElementById('zoneR');
function flashZone(side) {
  const el = side === 'left' ? zoneL : zoneR;
  el.classList.add('hit');
  setTimeout(() => el.classList.remove('hit'), 140);
}
function onTap(side) {
  const info = tap(state, side); // logic.js
  polePush(info.dir);
  flashZone(side);
}
function ensureAudio() { if (window.Music) window.Music.start(); }
canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  ensureAudio();
  onTap(e.clientX < window.innerWidth / 2 ? 'left' : 'right');
});
window.addEventListener('keydown', e => {
  ensureAudio();
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') onTap('left');
  else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') onTap('right');
});
const muteBtn = document.getElementById('muteBtn');
if (muteBtn) muteBtn.addEventListener('pointerdown', e => {
  e.preventDefault();
  ensureAudio();
  if (window.Music) muteBtn.textContent = window.Music.toggle() ? '🔇' : '🔊';
});
window.addEventListener('contextmenu', e => e.preventDefault());

// ============================== resize ==============================
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(Math.floor(w / PX), Math.floor(h / PX), false);
  const a = w / h;
  camera.left = -HALF_H * a; camera.right = HALF_H * a;
  camera.top = HALF_H; camera.bottom = -HALF_H;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ============================== main loop ==============================
const camPos = new THREE.Vector3(0, 0, 20);
const _gp = new THREE.Vector3();
let last = performance.now(), acc = 0;
const STEP = 1 / 60;
let time = 0, faded = false;

for (const s of sparkles) placeSparkle(s, 0, 20);

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  time += dt;

  // fixed-step physics
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 4) { update(state, STEP); acc -= STEP; n++; }
  if (n === 4) acc = 0;

  const gp = gondolaPos(state);
  ensureSegments(state.s);

  // gondola transform: gentle bob + a very subtle rock, roll with lateral drift, yaw along canal
  gond.group.position.set(gp.x, Math.sin(time * 1.1) * 0.09, gp.z);
  gond.group.rotation.y = state.yaw + Math.sin(time * 0.45) * 0.008;
  gond.group.rotation.z = -state.latV * 0.03 + Math.sin(time * 0.75) * 0.02;
  gond.group.rotation.x = Math.sin(time * 0.6 + 1) * 0.016;
  updatePole(dt);
  updateRipples(dt);

  // water bob per segment
  for (const [, sg] of segs) sg.waterMesh.position.y = Math.sin(time * 0.9 + sg.segIdx * 1.7) * 0.07;

  // waterfall scroll
  streakTex.offset.y = (time * 0.85) % 1;

  // camera follows, looking ahead (toward -z); shifted so the boat sits right of center
  _gp.set(gp.x, 0, gp.z - 12);
  camPos.lerp(_gp, 1 - Math.exp(-3 * dt));
  const halfW = HALF_H * window.innerWidth / window.innerHeight;
  const shx = -VIEW_SHIFT * halfW * Math.SQRT1_2;
  const shz = VIEW_SHIFT * halfW * Math.SQRT1_2;
  camera.position.set(camPos.x + ISO_OFF.x + shx, ISO_OFF.y, camPos.z + ISO_OFF.z + shz);
  camera.lookAt(camPos.x + shx, 0, camPos.z + shz);

  // sun hangs low, upper-left
  sunCore.position.set(camPos.x - 150, 70, camPos.z - 130);
  sunHalo.position.set(camPos.x - 150, 70, camPos.z - 130);

  // sparkles twinkle on the water
  for (const s of sparkles) {
    const dx = s.position.x - gp.x, dz = s.position.z - gp.z;
    if (dx * dx + dz * dz > 45 * 45) placeSparkle(s, gp.x, gp.z);
    const tw = 0.35 + 0.65 * Math.pow(Math.sin(time * s.userData.sp + s.userData.ph) * 0.5 + 0.5, 2);
    s.material.opacity = 0.7 * tw;
    const sc = 0.4 + 0.35 * tw;
    s.scale.set(sc, sc, 1);
  }
  // fireflies wander near the banks
  for (const f of fireflies) {
    const u = f.userData;
    f.position.set(
      gp.x + u.bx + Math.sin(time * 0.5 * u.sp + u.ph) * 6,
      u.by + Math.sin(time * 0.8 * u.sp + u.ph * 2) * 1.2,
      gp.z + u.bz + Math.cos(time * 0.4 * u.sp + u.ph) * 6
    );
    f.material.opacity = 0.25 + 0.55 * Math.pow(Math.sin(time * 1.7 * u.sp + u.ph) * 0.5 + 0.5, 2);
  }
  // shimmer bands drift along the canal, ahead of the boat
  for (const b of bands) {
    const bz = gp.z - 8 - ((b.off + time * 1.2) % 66);
    const bx = canalCenterWorld(bz);
    b.m.position.set(bx, 0.06, bz);
    b.m.rotation.z = -canalTangentAngle(bz);
  }

  renderer.render(scene, camera);
  if (!faded) { faded = true; document.getElementById('fade').style.opacity = '0'; }
}
requestAnimationFrame(frame);

// hook for headless integration tests (harmless in the browser)
window.__stillwater = { state, segs, gond, onTap, ensureSegments, camera };

})();
