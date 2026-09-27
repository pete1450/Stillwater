// test_music.js — headless test for Stillwater music.js. Run: node test_music.js
'use strict';
const fs = require('fs');
const path = require('path');

let oscCount = 0;
function param() {
  return {
    value: 0,
    setValueAtTime() {}, linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {}, cancelScheduledValues() {},
  };
}
function anode() {
  return {
    connect() {}, disconnect() {},
    gain: param(), frequency: param(), detune: param(), delayTime: param(),
    type: '', start() {}, stop() {},
  };
}
const ctxStub = {
  state: 'suspended', currentTime: 100, destination: {},
  resume() { this.state = 'running'; return Promise.resolve(); },
  suspend() {},
  createGain: anode,
  createOscillator() { oscCount++; return anode(); },
  createDelay: anode,
  createBiquadFilter: anode,
};
global.window = {
  AudioContext: function () { return ctxStub; },
};

eval(fs.readFileSync(path.join(__dirname, 'music.js'), 'utf8'));
const Music = global.window.Music;

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) pass++;
  else { fail++; console.log('FAIL:', name); }
}

ok(Music && typeof Music.start === 'function', 'Music module loaded');
Music.start();
ok(oscCount > 0, 'start() creates oscillators (drone + pad), count=' + oscCount);
const afterFirst = oscCount;
Music.start();
ok(oscCount === afterFirst, 'second start() is idempotent');
ok(Music.toggle() === true && Music.muted === true, 'toggle() mutes');
ok(Music.toggle() === false && Music.muted === false, 'toggle() unmutes');
Music._reset();
Music.start();
ok(oscCount > afterFirst, 'start() works again after reset');

Music._reset();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
