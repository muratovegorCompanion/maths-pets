// js/ui/pets.js — the friends living in a room: they walk, use things, sleep, and react to her finger.
// What they decide is in petBrain.js; this file only draws it and turns touches into events.
import { h, friendSrc, toast } from './dom.js';
import { FRIENDS } from '../catalog.js';
import { FLOOR, newPet, next, arrive, dropOn, tap, feed, chaseBall, freeItems } from '../petBrain.js';

const sleepSrc = id => `assets/friends/sleep/${id}.webp`;
const PARTICLE = { splash: '💧', music: '🎵', watch: '🫧', eat: '🍪', sniff: '🌸', sleep: '💤', bounce: '✨', swing: '✨', climb: '👀', rest: '💛' };
const HOLD_MS = 450;
const DROP_RADIUS = 0.13;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const isDog = id => FRIENDS.find(f => f.id === id)?.species === 'dachshund';

export function createPets({ roomEl, ids, items, sound, game, save, onTreats }) {
  const now = () => performance.now();
  const views = new Map();
  let pets = ids.map(id => newPet(id, now(), Math.random));
  let ball = null;   // { el, x, y }

  const frac = (cx, cy) => {
    const b = roomEl.getBoundingClientRect();
    return { x: (cx - b.left) / b.width, y: (cy - b.top) / b.height };
  };
  const onFloor = p => ({ x: clamp(p.x, FLOOR.x0, FLOOR.x1), y: clamp(p.y, FLOOR.y0, FLOOR.y1) });

  function particle(x, y, emoji) {
    const el = h('div', { class: 'particle', style: { left: `${x * 100}%`, top: `${y * 100}%` } }, emoji);
    el.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 60)}px`);
    roomEl.append(el);
    setTimeout(() => el.remove(), 1600);
  }

  function happySound(id) { if (isDog(id)) sound.bark(); else sound.chirp(); }

  function activitySound(p) {
    const s = { splash: sound.splash, bounce: sound.boing, music: sound.melody, eat: sound.munch }[p.activity];
    s?.();
  }

  function view(p) {
    let v = views.get(p.id);
    if (v) return v;
    const img = h('img', { class: 'pet-img', src: friendSrc(p.id), alt: '', draggable: 'false' });
    const face = h('div', { class: 'pet-face' }, img);
    const carried = h('div', { class: 'carried-ball' }, '🎾');
    const el = h('div', { class: 'pet' }, face, carried);
    v = { el, face, img, carried };
    views.set(p.id, v);
    roomEl.append(el);
    hookTouch(p.id, el);
    return v;
  }

  function draw(p, prev) {
    const v = view(p);
    const walking = p.mode === 'walk';
    const pos = walking ? p.target : p;
    const ms = walking ? Math.max(0, p.until - now()) : 0;
    v.el.style.transition = walking ? `left ${ms}ms linear, top ${ms}ms linear` : 'none';
    v.el.style.left = `${pos.x * 100}%`;
    v.el.style.top = `${pos.y * 100}%`;
    const it = p.mode === 'activity' ? items().find(i => i.id === p.item) : null;
    v.el.style.zIndex = String(it ? 11 + Math.round(it.y * 100) : 10 + Math.round(pos.y * 100));
    v.face.style.transform = `scaleX(${p.facing < 0 ? -1 : 1})`;
    const asleep = p.mode === 'activity' && p.activity === 'sleep';
    const src = asleep ? sleepSrc(p.id) : friendSrc(p.id);
    if (!v.img.src.endsWith(src)) v.img.src = src;
    v.el.className = ['pet', `mode-${p.mode}`, p.fast ? 'fast' : '', p.activity ? `act-${p.activity}` : '',
      p.reaction ? `react-${p.reaction}` : ''].filter(Boolean).join(' ');
    v.carried.style.display = p.carrying === 'ball' ? 'block' : 'none';
    if (prev && prev.mode !== 'activity' && p.mode === 'activity') activitySound(p);
    if (p.mode === 'react' && prev?.reaction !== p.reaction) {
      if (p.reaction === 'happy') { happySound(p.id); particle(p.x, p.y - 0.12, '❤️'); }
      if (p.reaction === 'stretch') { sound.chirp(); particle(p.x, p.y - 0.12, '☀️'); }
      if (p.reaction === 'eat') { sound.munch(); if (isDog(p.id)) setTimeout(() => sound.bark(), 700); particle(p.x, p.y - 0.12, '😋'); }
    }
  }

  function set(id, p) {
    const prev = pets.find(x => x.id === id);
    pets = pets.map(x => (x.id === id ? p : x));
    draw(p, prev);
  }

  // ---- her finger on a friend: tap = happy, hold still = stroke, move = carry ----
  function hookTouch(id, el) {
    let start = null, moved = false, petting = false, holdTimer = null, heartTimer = null;
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      try { el.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      start = { x: e.clientX, y: e.clientY };
      moved = false; petting = false;
      holdTimer = setTimeout(() => {
        if (moved) return;
        petting = true;
        const p = pets.find(x => x.id === id);
        set(id, { ...p, mode: 'react', reaction: 'love', activity: null, goal: null, goalItem: null, target: null, until: Infinity });
        happySound(id);
        heartTimer = setInterval(() => { const q = pets.find(x => x.id === id); particle(q.x + (Math.random() - 0.5) * 0.06, q.y - 0.14, '❤️'); }, 260);
      }, HOLD_MS);
    });
    el.addEventListener('pointermove', e => {
      if (!start) return;
      const far = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      // a still finger strokes; a finger that then moves picks the friend up, even mid-stroke
      if (!moved && far < (petting ? 24 : 10)) return;
      moved = true;
      petting = false;
      clearTimeout(holdTimer);
      clearInterval(heartTimer);
      const at = frac(e.clientX, e.clientY);
      const p = pets.find(x => x.id === id);
      set(id, { ...p, mode: 'carried', x: clamp(at.x, 0.03, 0.97), y: clamp(at.y, 0.2, 0.95), activity: null, reaction: null, goal: null, goalItem: null, target: null, carrying: null, until: Infinity });
    });
    const end = e => {
      if (!start) return;
      clearTimeout(holdTimer); clearInterval(heartTimer);
      const p = pets.find(x => x.id === id);
      const t = now();
      if (moved) {
        const at = frac(e.clientX, e.clientY);
        const near = items()
          .map(i => ({ i, d: Math.hypot(i.x - at.x, i.y - at.y) }))
          .filter(o => o.d < DROP_RADIUS)
          .sort((a, b) => a.d - b.d)[0]?.i ?? null;
        const occupied = !!near && pets.some(q => q.id !== id && q.mode === 'activity' && q.item === near.id);
        set(id, dropOn(p, near, t, onFloor(at), { occupied }));
      } else if (petting) {
        set(id, { ...p, mode: 'idle', reaction: null, until: t + 800 });
      } else {
        set(id, tap(p, t));
      }
      start = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // ---- the bone from the tray, dropped on a friend ----
  function feedAt(cx, cy) {
    const at = frac(cx, cy);
    const target = pets
      .filter(p => p.mode !== 'carried')
      .map(p => ({ p, d: Math.hypot(p.x - at.x, (p.y - 0.08) - at.y) }))
      .filter(o => o.d < 0.16)
      .sort((a, b) => a.d - b.d)[0]?.p;
    if (!target) return false;
    const res = feed(target, game.rewards, now());
    if (!res.ok) { toast('Win treats on a walk! 🐾'); return true; }
    save();
    onTreats();
    set(target.id, res.pet);
    return true;
  }

  // ---- the ball: tap the grass ----
  function throwBall(cx, cy) {
    if (ball) return;
    const at = onFloor(frac(cx, cy));
    const el = h('div', { class: 'ground-ball', style: { left: `${at.x * 100}%`, top: `${at.y * 100}%` } }, '🎾');
    roomEl.append(el);
    ball = { el, ...at };
    sound.tap();
    const out = chaseBall(pets, at, now());
    if (!out.chaser) { setTimeout(() => { el.remove(); ball = null; }, 1500); return; }
    const prev = pets;
    pets = out.pets;
    for (const p of pets) if (p !== prev.find(x => x.id === p.id)) draw(p, prev.find(x => x.id === p.id));
  }

  // ---- the clock: whoever's state ran out moves on ----
  const timer = setInterval(() => {
    if (!roomEl.isConnected) { destroy(); return; }
    const t = now();
    // the ball was left behind (its chaser was picked up or tapped): tidy it away
    if (ball && !pets.some(p => p.goal === 'ball' || p.carrying === 'ball')) { ball.el.remove(); ball = null; }
    for (const p of pets) {
      if (p.mode === 'carried' || t < p.until) continue;
      const n = p.mode === 'walk' ? arrive(p, t, Math.random) : next(p, freeItems(items(), pets, p.id), t, Math.random);
      if (p.goal === 'ball' && n.carrying === 'ball' && ball) { ball.el.remove(); }
      if (p.carrying === 'ball' && !n.carrying && ball) { ball = null; }
      set(p.id, n);
    }
  }, 120);

  const sparkle = setInterval(() => {
    for (const p of pets) if (p.mode === 'activity' && PARTICLE[p.activity] && Math.random() < 0.6) particle(p.x + (Math.random() - 0.5) * 0.05, p.y - 0.15, PARTICLE[p.activity]);
  }, 900);

  function destroy() { clearInterval(timer); clearInterval(sparkle); }

  for (const p of pets) draw(p, null);
  return { destroy, feedAt, throwBall };
}
