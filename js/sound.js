// js/sound.js — short happy sounds made in the browser, plus each kind of friend's real voice
// (recordings credited in CREDITS.md). A right answer sounds in the voice of the friend she walks with.
import { FRIENDS } from './catalog.js';

export const VOICES = {
  dachshund: ['assets/sounds/bark1.mp3', 'assets/sounds/bark2.mp3'],
  cat: ['assets/sounds/cat1.mp3'],
  giraffe: ['assets/sounds/giraffe1.mp3', 'assets/sounds/giraffe2.mp3'],
  koala: ['assets/sounds/koala1.mp3'],
  raccoon: ['assets/sounds/raccoon1.mp3'],
};

const speciesOf = id => FRIENDS.find(f => f.id === id)?.species;

export function createSound(game) {
  let ac = null;
  const voices = {}, turn = {};
  let loading = null;

  // Decode the voices once, the first time any sound is needed (audio needs a tap to start on tablets).
  function loadVoices(a) {
    if (loading) return;
    loading = Promise.all(Object.entries(VOICES).map(([kind, files]) =>
      Promise.all(files.map(u => fetch(u).then(r => r.arrayBuffer()).then(b => a.decodeAudioData(b))))
        .then(bufs => { voices[kind] = bufs; })
        .catch(() => { /* this voice missing: the chime plays instead */ })));
  }

  function audio() {
    if (!ac) {
      const C = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!C) return null;
      ac = new C();
      loadVoices(ac);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function tone(a, freq, start, dur, type = 'sine', vol = 0.16) {
    const o = a.createOscillator(), g = a.createGain();
    const t = a.currentTime + start;
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function play(notes) {
    if (game.muted) return;
    try {
      const a = audio();
      if (a) for (const [f, s, d, type] of notes) tone(a, f, s, d, type);
    } catch { /* no audio on this device: play silently */ }
  }

  // The voice of a kind of friend ('dachshund', 'cat', …); takes turns between its recordings.
  function voice(kind) {
    if (game.muted) return;
    try {
      const a = audio();
      const bufs = voices[kind];
      if (!a || !bufs?.length) { play([[660, 0, 0.12], [880, 0.1, 0.2]]); return; }
      turn[kind] = ((turn[kind] ?? -1) + 1) % bufs.length;
      const src = a.createBufferSource(), g = a.createGain();
      src.buffer = bufs[turn[kind]];
      g.gain.value = 0.9;
      src.connect(g).connect(a.destination);
      src.start();
    } catch { /* no audio on this device */ }
  }

  function sweep(from, to, dur, type = 'sine', vol = 0.16) {
    if (game.muted) return;
    try {
      const a = audio(); if (!a) return;
      const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
      o.type = type; o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
    } catch { /* no audio */ }
  }

  function noise(dur, vol = 0.12, cutoff = 1800) {
    if (game.muted) return;
    try {
      const a = audio(); if (!a) return;
      const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      src.buffer = buf; f.type = 'lowpass'; f.frequency.value = cutoff; g.gain.value = vol;
      src.connect(f).connect(g).connect(a.destination); src.start();
    } catch { /* no audio */ }
  }

  return {
    tap: () => play([[660, 0, 0.05]]),
    right: () => voice(speciesOf(game.activeFriend) ?? 'dachshund'),
    voice,
    friend: id => voice(speciesOf(id)),
    chirp: () => sweep(700, 1400, 0.18, 'sine', 0.14),
    boing: () => sweep(180, 520, 0.35, 'triangle', 0.16),
    splash: () => noise(0.45, 0.14, 2200),
    munch: () => { noise(0.08, 0.1, 900); setTimeout(() => noise(0.08, 0.1, 900), 160); setTimeout(() => noise(0.08, 0.1, 900), 320); },
    melody: () => play([[523, 0, 0.18], [659, 0.2, 0.18], [784, 0.4, 0.18], [659, 0.6, 0.18], [880, 0.8, 0.3], [784, 1.1, 0.4]]),
    wrong: () => play([[300, 0, 0.16, 'triangle'], [240, 0.13, 0.22, 'triangle']]),
    chest: () => play([[523, 0, 0.14], [659, 0.12, 0.14], [784, 0.24, 0.14], [1047, 0.36, 0.4]]),
    levelUp: () => play([[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.1], [1319, 0.4, 0.45]]),
    toggle() { game.muted = !game.muted; return game.muted; },
  };
}
