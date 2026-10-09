// js/sound.js — short happy sounds made in the browser, no sound files.
export function createSound(game) {
  let ac = null;

  function audio() {
    if (!ac) {
      const C = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!C) return null;
      ac = new C();
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

  return {
    tap: () => play([[660, 0, 0.05]]),
    right: () => play([[660, 0, 0.12], [880, 0.1, 0.2]]),
    wrong: () => play([[300, 0, 0.16, 'triangle'], [240, 0.13, 0.22, 'triangle']]),
    chest: () => play([[523, 0, 0.14], [659, 0.12, 0.14], [784, 0.24, 0.14], [1047, 0.36, 0.4]]),
    levelUp: () => play([[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.1], [1319, 0.4, 0.45]]),
    toggle() { game.muted = !game.muted; return game.muted; },
  };
}
