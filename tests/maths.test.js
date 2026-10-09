// tests/maths.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAddition, makeTimes, makeChoices, hintSteps, TIMES_GROUPS } from '../js/maths.js';

const ones = n => n % 10;
const tens = n => Math.floor(n / 10);

function many(fn, n = 500) { const out = []; for (let i = 0; i < n; i++) out.push(fn()); return out; }

test('level 1: tens + tens, sum at most 100', () => {
  for (const q of many(() => makeAddition(1))) {
    assert.equal(ones(q.a), 0); assert.equal(ones(q.b), 0);
    assert.ok(q.a >= 10 && q.b >= 10 && q.answer <= 100);
    assert.equal(q.answer, q.a + q.b);
  }
});

test('level 2: two-digit + one-digit, no carry', () => {
  for (const q of many(() => makeAddition(2))) {
    assert.ok(q.a >= 10 && q.a <= 99 && q.b >= 1 && q.b <= 9);
    assert.ok(ones(q.a) + q.b <= 9);
  }
});

test('level 3: two-digit + one-digit, with carry, under 100', () => {
  for (const q of many(() => makeAddition(3))) {
    assert.ok(q.a >= 10 && q.b >= 1 && q.b <= 9);
    assert.ok(ones(q.a) + q.b >= 10);
    assert.ok(q.answer < 100);
  }
});

test('level 4: two-digit + two-digit, no carry, under 100', () => {
  for (const q of many(() => makeAddition(4))) {
    assert.ok(q.a >= 10 && q.b >= 10);
    assert.ok(ones(q.a) + ones(q.b) <= 9);
    assert.ok(q.answer < 100);
  }
});

test('level 5: two-digit + two-digit, with carry, under 100', () => {
  for (const q of many(() => makeAddition(5))) {
    assert.ok(q.a >= 10 && q.b >= 10);
    assert.ok(ones(q.a) + ones(q.b) >= 10);
    assert.ok(q.answer < 100);
  }
});

test('level 6: two-digit + two-digit, total over 100', () => {
  for (const q of many(() => makeAddition(6))) {
    assert.ok(q.a >= 10 && q.a <= 99 && q.b >= 10 && q.b <= 99);
    assert.ok(q.answer > 100);
  }
});

test('times: one factor from the group, other 1..12, fact key is order-free', () => {
  for (let g = 0; g < 3; g++) for (const q of many(() => makeTimes(g), 300)) {
    assert.ok(TIMES_GROUPS[g].includes(q.a) || TIMES_GROUPS[g].includes(q.b));
    assert.ok(q.a >= 1 && q.a <= 12 && q.b >= 1 && q.b <= 12);
    assert.equal(q.answer, q.a * q.b);
    assert.equal(q.key, `${Math.min(q.a, q.b)}x${Math.max(q.a, q.b)}`);
  }
});

test('choices: 4 distinct positive values, one correct', () => {
  for (const lvl of [1, 2, 3, 4, 5, 6]) for (const q of many(() => makeAddition(lvl), 200)) {
    const c = makeChoices(q);
    assert.equal(c.length, 4);
    assert.equal(new Set(c.map(x => x.value)).size, 4);
    assert.ok(c.every(x => x.value > 0));
    assert.equal(c.filter(x => x.tag === null).length, 1);
    assert.equal(c.find(x => x.tag === null).value, q.answer);
  }
  for (let g = 0; g < 3; g++) for (const q of many(() => makeTimes(g), 200)) {
    const c = makeChoices(q);
    assert.equal(new Set(c.map(x => x.value)).size, 4);
    assert.equal(c.find(x => x.tag === null).value, q.answer);
  }
});

test('59+25 offers the forgot-carry and side-by-side mistakes', () => {
  const q = { track: 'add', level: 5, a: 59, b: 25, answer: 84, key: '59+25', text: '59 + 25' };
  const c = makeChoices(q);
  assert.deepEqual(c.find(x => x.tag === 'forgot_carry')?.value, 74);
  assert.deepEqual(c.find(x => x.tag === 'side_by_side')?.value, 714);
});

test('hint for 59+25 splits into tens and ones', () => {
  const q = { track: 'add', level: 5, a: 59, b: 25, answer: 84, key: '59+25', text: '59 + 25' };
  assert.deepEqual(hintSteps(q).map(s => [s.prompt, s.answer]),
    [['50 + 20', 70], ['9 + 5', 14], ['70 + 14', 84]]);
});

test('hint for 47+8 adds ones then tens', () => {
  const q = { track: 'add', level: 3, a: 47, b: 8, answer: 55, key: '47+8', text: '47 + 8' };
  assert.deepEqual(hintSteps(q).map(s => [s.prompt, s.answer]),
    [['7 + 8', 15], ['40 + 15', 55]]);
});

test('hint for 30+40 counts tens', () => {
  const q = { track: 'add', level: 1, a: 30, b: 40, answer: 70, key: '30+40', text: '30 + 40' };
  assert.deepEqual(hintSteps(q).map(s => [s.prompt, s.answer]),
    [['3 + 4', 7], ['7 tens', 70]]);
});

test('hint for every generated question ends on the answer', () => {
  for (const lvl of [1, 2, 3, 4, 5, 6]) for (const q of many(() => makeAddition(lvl), 100)) {
    const s = hintSteps(q); assert.equal(s.at(-1).answer, q.answer);
  }
  for (let g = 0; g < 3; g++) for (const q of many(() => makeTimes(g), 100)) {
    const s = hintSteps(q); assert.equal(s.at(-1).answer, q.answer);
  }
});

test('times hint counts in the table', () => {
  const q = { track: 'times', level: 1, a: 4, b: 8, answer: 32, key: '4x8', text: '4 × 8' };
  const s = hintSteps(q);
  assert.equal(s.length, 1);
  assert.equal(s[0].prompt, '8, 16, 24, ?');
  assert.equal(s[0].answer, 32);
});
