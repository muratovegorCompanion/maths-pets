import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITY, MIN_STEP, FLOOR, newPet, next, arrive, dropOn, tap, feed, chaseBall, activitySpot,
} from '../js/petBrain.js';
import { ITEMS } from '../js/catalog.js';

const seq = values => { let i = 0; return () => values[i++ % values.length]; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('every thing in the shop has something a friend can do with it', () => {
  for (const it of ITEMS) assert.ok(ACTIVITY[it.id], `no activity for ${it.id}`);
});

test('a walk always goes somewhere noticeably far, and stays on the floor', () => {
  for (let i = 0; i < 300; i++) {
    const p = newPet('biscuit', 0, Math.random);
    const w = next(p, [], 0, Math.random);
    if (w.mode !== 'walk') continue;
    assert.ok(dist(p, w.target) >= MIN_STEP - 1e-9, 'step too short');
    assert.ok(w.target.x >= FLOOR.x0 && w.target.x <= FLOOR.x1 && w.target.y >= FLOOR.y0 && w.target.y <= FLOOR.y1);
  }
});

test('a friend never stands still for long: idle pauses are short', () => {
  const p = { ...newPet('biscuit', 0, Math.random), mode: 'walk', target: { x: 0.5, y: 0.6 }, until: 1000 };
  const idle = arrive(p, 1000, Math.random);
  assert.equal(idle.mode, 'idle');
  assert.ok(idle.until - 1000 >= 1000 && idle.until - 1000 <= 3500);
});

test('it faces the way it walks', () => {
  const p = { ...newPet('biscuit', 0, Math.random), x: 0.8, y: 0.6 };
  const w = next({ ...p, mode: 'idle', until: 0 }, [], 0, seq([0.99, 0.0, 0.5]));
  assert.equal(w.mode, 'walk');
  assert.equal(w.facing, w.target.x < p.x ? -1 : 1);
});

test('sometimes a friend goes to a thing on its own and then uses it', () => {
  const pond = { id: 'pond', x: 0.3, y: 0.7 };
  const p = { ...newPet('biscuit', 0, Math.random), x: 0.8, y: 0.6, mode: 'idle', until: 0 };
  const w = next(p, [pond], 0, seq([0.1, 0.0]));         // low roll → go to a thing
  assert.equal(w.mode, 'walk');
  assert.equal(w.goal, 'pond');
  const a = arrive(w, w.until, Math.random);
  assert.equal(a.mode, 'activity');
  assert.equal(a.activity, 'splash');
});

test('dropping a friend on a bed puts it to sleep, and it sleeps until woken', () => {
  const bed = { id: 'dogbed', x: 0.4, y: 0.7 };
  const s = dropOn(newPet('biscuit', 0, Math.random), bed, 1000);
  assert.equal(s.mode, 'activity');
  assert.equal(s.activity, 'sleep');
  assert.deepEqual({ x: s.x, y: s.y }, activitySpot('sleep', bed));
  assert.ok(s.until - 1000 >= 40000, 'sleeps a good while, not a few seconds');
  const woke = tap(s, 2000, Math.random);
  assert.equal(woke.mode, 'react');
  assert.equal(woke.reaction, 'stretch');
});

test('dropping on the floor just leaves the friend there', () => {
  const p = dropOn(newPet('biscuit', 0, Math.random), null, 1000, { x: 0.2, y: 0.7 });
  assert.equal(p.mode, 'idle');
  assert.deepEqual({ x: p.x, y: p.y }, { x: 0.2, y: 0.7 });
});

test('climbing puts the friend up high on the thing', () => {
  const tree = { id: 'treehouse', x: 0.5, y: 0.7 };
  const c = dropOn(newPet('kiki', 0, Math.random), tree, 0);
  assert.equal(c.activity, 'climb');
  assert.ok(c.y < tree.y - 0.1);
});

test('a tap on an awake friend makes it happy, then it runs off', () => {
  const p = { ...newPet('biscuit', 0, Math.random), mode: 'idle', until: 99999 };
  const r = tap(p, 500, Math.random);
  assert.equal(r.mode, 'react');
  assert.equal(r.reaction, 'happy');
  const run = next(r, [], r.until, Math.random);
  assert.equal(run.mode, 'walk');
  assert.ok(run.fast, 'runs rather than strolls after a tap');
});

test('feeding costs one treat and is refused with none', () => {
  const rewards = { treats: 0 };
  const p = newPet('biscuit', 0, Math.random);
  assert.equal(feed(p, rewards, 0).ok, false);
  rewards.treats = 3;
  const f = feed(p, rewards, 0);
  assert.equal(f.ok, true);
  assert.equal(rewards.treats, 2);
  assert.equal(f.pet.reaction, 'eat');
});

test('the nearest awake friend chases the ball; a sleeping one is left alone', () => {
  const ball = { x: 0.2, y: 0.7 };
  const sleeper = { ...newPet('biscuit', 0, Math.random), x: 0.21, y: 0.7, mode: 'activity', activity: 'sleep', until: 99999 };
  const near = { ...newPet('mittens', 0, Math.random), x: 0.4, y: 0.7, mode: 'idle', until: 0 };
  const far = { ...newPet('kiki', 0, Math.random), x: 0.9, y: 0.7, mode: 'idle', until: 0 };
  const out = chaseBall([sleeper, near, far], ball, 0);
  assert.equal(out.chaser, 'mittens');
  const m = out.pets.find(p => p.id === 'mittens');
  assert.equal(m.mode, 'walk');
  assert.equal(m.goal, 'ball');
  assert.ok(m.fast);
  assert.equal(out.pets.find(p => p.id === 'biscuit').mode, 'activity');
});

test('a friend that reaches the ball brings it back to the middle', () => {
  const chaser = { ...newPet('mittens', 0, Math.random), mode: 'walk', goal: 'ball', target: { x: 0.2, y: 0.7 }, until: 800 };
  const back = arrive(chaser, 800, Math.random);
  assert.equal(back.mode, 'walk');
  assert.equal(back.carrying, 'ball');
  const home = arrive(back, back.until, Math.random);
  assert.equal(home.carrying, null);
  assert.equal(home.mode, 'react');
});

test('with no awake friend nobody chases the ball', () => {
  const sleeper = { ...newPet('biscuit', 0, Math.random), mode: 'activity', activity: 'sleep', until: 99999 };
  assert.equal(chaseBall([sleeper], { x: 0.5, y: 0.7 }, 0).chaser, null);
});

test('a friend that wanders to a bed on its own naps briefly; one she puts there sleeps long', () => {
  const bed = { id: 'dogbed', x: 0.4, y: 0.7 };
  const walking = { ...newPet('biscuit', 0, Math.random), mode: 'walk', goal: 'dogbed', goalItem: bed, target: activitySpot('sleep', bed), until: 1000 };
  const nap = arrive(walking, 1000, Math.random);
  assert.equal(nap.activity, 'sleep');
  assert.ok(nap.until - 1000 <= 12000, `own nap too long: ${nap.until - 1000}`);
  const put = dropOn(newPet('biscuit', 0, Math.random), bed, 1000);
  assert.ok(put.until - 1000 >= 40000);
});

test('a thing someone is using is not free for another friend to wander to', async () => {
  const { freeItems } = await import('../js/petBrain.js');
  const bed = { id: 'dogbed', x: 0.4, y: 0.7 }, piano = { id: 'piano', x: 0.7, y: 0.6 };
  const sleeper = { ...newPet('biscuit', 0, Math.random), mode: 'activity', activity: 'sleep', item: 'dogbed', until: 99999 };
  const walker = { ...newPet('pepper', 0, Math.random), mode: 'walk', goal: 'piano', goalItem: piano, until: 99999 };
  const me = newPet('mittens', 0, Math.random);
  assert.deepEqual(freeItems([bed, piano], [sleeper, walker, me], 'mittens'), []);
  assert.deepEqual(freeItems([bed, piano], [sleeper, me], 'mittens').map(i => i.id), ['piano']);
});

test('putting a friend on a bed that is taken lays it down beside the other one', () => {
  const bed = { id: 'dogbed', x: 0.4, y: 0.7 };
  const first = dropOn(newPet('biscuit', 0, Math.random), bed, 0);
  const second = dropOn(newPet('mittens', 0, Math.random), bed, 0, null, { occupied: true });
  assert.equal(second.activity, 'sleep');
  assert.ok(Math.abs(second.x - first.x) >= 0.07, 'lies next to, not on top of, the first friend');
});
