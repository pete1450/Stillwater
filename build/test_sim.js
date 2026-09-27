// test_sim.js — headless integration test for Stillwater game.js.
// Stubs THREE + DOM, then drives frames and taps. Run: node test_sim.js
'use strict';
const fs = require('fs');
const path = require('path');

/* ---------------- minimal THREE stub ---------------- */
function V3(x, y, z) {
  return {
    x: x || 0, y: y || 0, z: z || 0,
    set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; },
    lerp(v, k) { this.x += (v.x - this.x) * k; this.y += (v.y - this.y) * k; this.z += (v.z - this.z) * k; return this; },
  };
}
function EU() {
  return { x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; } };
}
function NODE() {
  return {
    position: V3(), rotation: EU(), scale: V3(1, 1, 1),
    children: [], visible: true,
    add(...cs) { for (const c of cs) this.children.push(c); return this; },
    traverse(fn) { fn(this); for (const c of this.children) c.traverse(fn); },
    updateMatrix() {},
    getWorldPosition(v) { return v.set(this.position.x, this.position.y, this.position.z); },
    lookAt(...a) { this._lookAt = a; },
  };
}
const matrixCalls = [];
const THREE = {
  WebGLRenderer: function () { return { setPixelRatio() {}, setSize() {}, render() {} }; },
  Scene: function () { const n = NODE(); n.fog = null; n.background = null; n.remove = c => { n.children = n.children.filter(x => x !== c); }; return n; },
  Fog: function (color, near, far) { return { color, near, far }; },
  HemisphereLight: function () { return { position: V3() }; },
  DirectionalLight: function () { return { position: V3() }; },
  CanvasTexture: function () { return { offset: { x: 0, y: 0 } }; },
  OrthographicCamera: function () { const n = NODE(); n.updateProjectionMatrix = () => {}; return n; },
  Vector3: function (x, y, z) { return V3(x, y, z); },
  Group: NODE,
  Mesh: function (geo, mat) { const n = NODE(); n.geometry = geo; n.material = mat; return n; },
  BoxGeometry: function () { return {}; }, PlaneGeometry: function () { return {}; }, RingGeometry: function () { return {}; },
  InstancedMesh: function (geo, mat, count) {
    const n = NODE(); n.isInstancedMesh = true;
    n.capacity = count; n.count = count; n.disposed = false;
    n.setMatrixAt = (i) => { matrixCalls.push([n.capacity, i]); if (i >= n.capacity) throw new Error('instance index out of range'); };
    n.setColorAt = () => {};
    n.dispose = () => { n.disposed = true; };
    return n;
  },
  MeshLambertMaterial: function (o) { return Object.assign({ opacity: 1 }, o); },
  MeshBasicMaterial: function (o) { return Object.assign({ opacity: 1 }, o); },
  SpriteMaterial: function (o) { return Object.assign({ opacity: 1 }, o); },
  Sprite: function (mat) { const n = NODE(); n.material = mat; return n; },
  Color: function () { return { setHSL() { return this; } }; },
  Object3D: NODE,
  AdditiveBlending: 2, RepeatWrapping: 1001, DoubleSide: 2,
};

/* ---------------- minimal DOM stub ---------------- */
const grad = { addColorStop() {} };
const ctx2d = {
  createLinearGradient: () => grad, createRadialGradient: () => grad,
  fillRect() {}, clearRect() {},
};
Object.defineProperty(ctx2d, 'fillStyle', { set() {}, get() { return ''; } });
function element() {
  return {
    classList: { add() {}, remove() {} },
    style: {},
    listeners: {},
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
  };
}
const canvasEl = element();
const byId = { c: canvasEl, zoneL: element(), zoneR: element(), hint: element(), title: element(), fade: element() };
const document = {
  getElementById: id => byId[id] || element(),
  createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }),
};
const winListeners = {};
const window = {
  innerWidth: 800, innerHeight: 600,
  addEventListener(t, fn) { (winListeners[t] = winListeners[t] || []).push(fn); },
};
let rafCb = null;
let nowMs = 0;

/* ---------------- load ---------------- */
Object.assign(global, require('./logic.js'));
global.THREE = THREE;
global.document = document;
global.window = window;
global.performance = { now: () => nowMs };
global.requestAnimationFrame = fn => { rafCb = fn; };

const src = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
eval(src);

const SW = window.__stillwater;
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) pass++;
  else { fail++; console.log('FAIL:', name); }
}
function frames(n) {
  for (let i = 0; i < n; i++) { nowMs += 16.7; rafCb(nowMs); }
}
function tapAt(x) {
  for (const fn of (canvasEl.listeners.pointerdown || [])) fn({ clientX: x, preventDefault() {} });
}

/* ---------------- tests ---------------- */
ok(SW && SW.state, 'debug hook exposed');
frames(120);
ok(true, '120 frames render without throwing');
ok(SW.segs.size >= 3 && SW.segs.size <= 6, 'segment window populated + bounded (' + SW.segs.size + ')');

const s0 = SW.state.s;
tapAt(100); // left tap
frames(30);
ok(SW.state.v > 0, 'tap adds speed, v=' + SW.state.v.toFixed(2));
ok(SW.state.s < s0, 'gondola travels toward -z');
ok(SW.state.latV > 0, 'left tap pushes hull right');

// gondola mesh follows physics
const L = require('./logic.js');
const gp = L.gondolaPos(SW.state);
ok(Math.abs(SW.gond.group.position.x - gp.x) < 0.01, 'gondola mesh x matches physics');
ok(Math.abs(SW.gond.group.position.z - gp.z) < 0.01, 'gondola mesh z matches physics');

// alternate taps steer back and forth
for (let i = 0; i < 6; i++) { tapAt(700); frames(20); tapAt(100); frames(20); }
ok(SW.state.v > 1, 'still moving after tap sequence');

// coast to a stop
frames(3600);
ok(SW.state.v === 0, 'coasts to stop, v=' + SW.state.v);

// teleport far ahead: old segments culled, new ones built
SW.state.s += 600;
frames(120);
ok(SW.segs.size >= 3 && SW.segs.size <= 6, 'segments recycled after jump (' + SW.segs.size + ')');
let mn = Infinity;
for (const k of SW.segs.keys()) mn = Math.min(mn, k);
ok(mn * L.SEG_LEN < SW.state.s, 'segment window tracks gondola');

// all instanced writes stayed in range (checked live in stub)
ok(matrixCalls.length > 5000, 'thousands of instance matrices written (' + matrixCalls.length + ')');

// camera shifted so the boat sits right of screen center
frames(300); // let the camera settle
{
  const gp3 = L.gondolaPos(SW.state);
  const look = SW.camera._lookAt;
  const halfW = 24 * (800 / 600);
  const wantX = gp3.x - 0.25 * halfW * Math.SQRT1_2;
  ok(Math.abs(look[0] - wantX) < 2.5, `camera leads boat right of center (lookX=${look[0].toFixed(2)}, want ~${wantX.toFixed(2)})`);
  ok(look[0] < gp3.x, 'look target is screen-left of the boat');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
