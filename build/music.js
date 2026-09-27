// music.js — generative ambient music for Stillwater. Pure WebAudio, no files.
// Very quiet by design: slow pads + sparse pentatonic plucks through a soft delay.
'use strict';
window.Music = (function () {
  let ctx = null, master = null, delaySend = null;
  let started = false, muted = false;
  let padTimer = null, pluckTimer = null, chordIdx = 0;

  // dreamy progression: Cmaj9 -> Am9 -> Fmaj9 -> G6/9
  const CHORDS = [
    [130.81, 164.81, 196.00, 293.66],
    [110.00, 130.81, 164.81, 246.94],
    [87.31, 130.81, 164.81, 196.00],
    [98.00, 146.83, 164.81, 246.94],
  ];
  const CHORD_SECS = 11;
  const PENTA = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00];

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      const soft = ctx.createBiquadFilter();
      soft.type = 'lowpass'; soft.frequency.value = 2400;
      master.connect(soft); soft.connect(ctx.destination);
      // dreamy space: simple feedback delay
      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = 0.45;
      const fb = ctx.createGain(); fb.gain.value = 0.35;
      const wet = ctx.createGain(); wet.gain.value = 0.3;
      delaySend = ctx.createGain(); delaySend.gain.value = 1;
      delaySend.connect(delay); delay.connect(fb); fb.connect(delay);
      delay.connect(wet); wet.connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function padNote(freq, t0, dur) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.035, t0 + 4);
    g.gain.setValueAtTime(0.035, t0 + dur - 4);
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    g.connect(master);
    for (const [type, detune] of [['sine', 0], ['triangle', 5]]) {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = freq; o.detune.value = detune;
      o.connect(g);
      o.start(t0); o.stop(t0 + dur + 0.1);
    }
  }

  function playChord() {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + 0.1;
    for (const f of CHORDS[chordIdx % CHORDS.length]) padNote(f, t0, CHORD_SECS + 2);
    chordIdx++;
  }

  function pluck() {
    if (!ctx) return;
    if (!muted && Math.random() < 0.85) {
      const t0 = ctx.currentTime + 0.05;
      const f = PENTA[Math.floor(Math.random() * PENTA.length)];
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.11, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.8);
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      const o2 = ctx.createOscillator();
      o2.type = 'triangle'; o2.frequency.value = f * 2; // faint shimmer
      const g2 = ctx.createGain(); g2.gain.value = 0.25;
      o.connect(g); o2.connect(g2); g2.connect(g);
      g.connect(master); g.connect(delaySend);
      o.start(t0); o.stop(t0 + 3); o2.start(t0); o2.stop(t0 + 3);
    }
    pluckTimer = setTimeout(pluck, 2500 + Math.random() * 3800);
  }

  function drone() {
    const o = ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = 65.41; // C2
    const g = ctx.createGain(); g.gain.value = 0.028;
    o.connect(g); g.connect(master);
    o.start();
  }

  return {
    start() {
      if (!ensure()) return;
      if (started) return;
      started = true;
      drone();
      playChord();
      padTimer = setInterval(playChord, CHORD_SECS * 1000);
      pluck();
    },
    toggle() {
      muted = !muted;
      if (ctx && master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() { return muted; },
    _reset() { // for tests
      started = false; muted = false; chordIdx = 0;
      if (padTimer) clearInterval(padTimer);
      if (pluckTimer) clearTimeout(pluckTimer);
      padTimer = pluckTimer = null; ctx = null;
    },
  };
})();
