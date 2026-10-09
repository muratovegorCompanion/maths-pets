// tests/rewards.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { newRewards, addTreats, countAnswer, openChest, buy, localDate, DAILY_GOAL } from '../js/rewards.js';
import { FRIENDS, ITEMS } from '../js/catalog.js';

const seq = values => { let i = 0; return () => values[i++ % values.length]; };

test('daily goal is met exactly on the 20th answer of the day', () => {
  const r = newRewards();
  for (let i = 1; i < DAILY_GOAL; i++) assert.equal(countAnswer(r, '2026-10-09').goalJustMet, false);
  assert.equal(countAnswer(r, '2026-10-09').goalJustMet, true);
  assert.equal(countAnswer(r, '2026-10-09').goalJustMet, false);
});

test('a new local date restarts the daily count (playing across midnight)', () => {
  const r = newRewards();
  for (let i = 0; i < 15; i++) countAnswer(r, '2026-10-09');
  countAnswer(r, '2026-10-10');
  assert.deepEqual([r.daily.date, r.daily.count, r.daily.goalMet], ['2026-10-10', 1, false]);
});

function meetGoal(r, day) { for (let i = 0; i < DAILY_GOAL; i++) countAnswer(r, day); }

test('streak grows on consecutive days', () => {
  const r = newRewards();
  meetGoal(r, '2026-10-05'); meetGoal(r, '2026-10-06'); meetGoal(r, '2026-10-07');
  assert.equal(r.streak.count, 3);
});

test('one missed day is forgiven once a week when the streak is 3+', () => {
  const r = newRewards();
  meetGoal(r, '2026-10-05'); meetGoal(r, '2026-10-06'); meetGoal(r, '2026-10-07');
  meetGoal(r, '2026-10-09');                        // missed the 8th
  assert.equal(r.streak.count, 4);
  meetGoal(r, '2026-10-11');                        // missed the 10th, same ISO week
  assert.equal(r.streak.count, 1);
});

test('a missed day on a short streak restarts it', () => {
  const r = newRewards();
  meetGoal(r, '2026-10-05'); meetGoal(r, '2026-10-07');
  assert.equal(r.streak.count, 1);
});

test('the chest gives a friend at the latest on the 5th walk', () => {
  const r = newRewards(); r.friends = ['biscuit'];
  const never = seq([0.99]);
  for (let i = 0; i < 4; i++) assert.equal(openChest(r, never).prizes[0].type, 'item');
  assert.equal(openChest(r, never).prizes[0].type, 'friend');
  assert.equal(r.walksSinceFriend, 0);
});

test('the chest never gives something already owned', () => {
  const r = newRewards();
  for (let i = 0; i < 200; i++) {
    const before = new Set([...r.friends, ...r.items]);
    for (const p of openChest(r).prizes) if (p.id) assert.ok(!before.has(p.id));
  }
});

test('when everything is owned the chest gives treats', () => {
  const r = newRewards(); r.friends = FRIENDS.map(f => f.id); r.items = ITEMS.map(i => i.id);
  const p = openChest(r).prizes[0];
  assert.equal(p.type, 'treats'); assert.ok(p.amount > 0);
});

test('a double chest gives two prizes', () => {
  assert.equal(openChest(newRewards(), Math.random, { double: true }).prizes.length, 2);
});

test('buying spends treats and refuses when short or owned', () => {
  const r = newRewards(); addTreats(r, 50);
  assert.deepEqual(buy(r, 'item', 'sofa'), { ok: false, reason: 'not_enough' });
  assert.deepEqual(buy(r, 'item', 'rug'), { ok: true });
  assert.equal(r.treats, 10);
  assert.deepEqual(buy(r, 'item', 'rug'), { ok: false, reason: 'owned' });
  assert.deepEqual(buy(r, 'item', 'nope'), { ok: false, reason: 'unknown' });
});

test('localDate uses the local calendar day', () => {
  assert.equal(localDate(new Date(2026, 9, 9, 23, 59)), '2026-10-09');
  assert.equal(localDate(new Date(2026, 9, 10, 0, 1)), '2026-10-10');
});

test('currentStreak shows the streak only while it is still alive', async () => {
  const { currentStreak } = await import('../js/rewards.js');
  const r = newRewards();
  assert.equal(currentStreak(r, '2026-10-09'), 0);
  meetGoal(r, '2026-10-05'); meetGoal(r, '2026-10-06'); meetGoal(r, '2026-10-07');
  assert.equal(currentStreak(r, '2026-10-07'), 3);
  assert.equal(currentStreak(r, '2026-10-08'), 3);
  assert.equal(currentStreak(r, '2026-10-09'), 3);   // one missed day can still be forgiven
  assert.equal(currentStreak(r, '2026-10-10'), 0);
  const s = newRewards(); meetGoal(s, '2026-10-05');
  assert.equal(currentStreak(s, '2026-10-07'), 0);   // short streak, gap of 2 breaks it
});
