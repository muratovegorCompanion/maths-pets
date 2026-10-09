// tests/walk.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { startWalk, showNext, submit, finishHint, advance, WALK_PLAN } from '../js/walk.js';
import { newGame } from '../js/storage.js';

test('a walk has 6 addition and 4 times questions', () => {
  const w = startWalk();
  assert.equal(w.tracks.length, 10);
  assert.equal(w.tracks.filter(t => t === 'add').length, WALK_PLAN.add);
  assert.equal(w.tracks.filter(t => t === 'times').length, WALK_PLAN.times);
});

test('a double tap records only one answer', () => {
  const g = newGame(); const w = startWalk(); showNext(w, g, 0);
  const first = submit(w, g, w.q.answer, 3000, '2026-10-09');
  const second = submit(w, g, w.q.answer, 3100, '2026-10-09');
  assert.ok(first);
  assert.equal(second, null);
  assert.equal(g.progress.counter, 1);
  assert.equal(g.rewards.daily.count, 1);
});

test('right answer: 2 treats, row is correct with seconds', () => {
  const g = newGame(); const w = startWalk(); showNext(w, g, 0);
  const res = submit(w, g, w.q.answer, 4500, '2026-10-09');
  assert.equal(res.correct, true);
  assert.equal(g.rewards.treats, 2);
  assert.equal(res.row.is_correct, true);
  assert.equal(res.row.seconds, 4.5);
  assert.equal(res.row.mode, 'walk');
  assert.equal(w.hint, null);
});

test('wrong choice: no treats, mistake tag recorded, hint shown, finishing hint gives 1', () => {
  const g = newGame(); const w = startWalk(); showNext(w, g, 0);
  const wrong = w.choices.find(c => c.tag !== null);
  const res = submit(w, g, wrong.value, 2000, '2026-10-09');
  assert.equal(res.correct, false);
  assert.equal(res.tag, wrong.tag);
  assert.equal(res.row.mistake_tag, wrong.tag);
  assert.ok(w.hint.length >= 1);
  assert.equal(g.rewards.treats, 0);
  finishHint(w, g);
  assert.equal(g.rewards.treats, 1);
  assert.equal(w.hint, null);
});

test('ten advances finish the walk', () => {
  const g = newGame(); const w = startWalk();
  for (let i = 0; i < 10; i++) { showNext(w, g, 0); submit(w, g, w.q.answer, 1000, '2026-10-09'); advance(w); }
  assert.equal(w.done, true);
});

test('a typed wrong answer still gets its mistake tag', () => {
  const g = newGame(); g.progress.add.mode = 'keypad'; g.progress.times.mode = 'keypad';
  const w = startWalk(); showNext(w, g, 0);
  w.q = { track: 'add', level: 1, a: 59, b: 25, answer: 84, key: '59+25', text: '59 + 25', mode: 'keypad' };
  w.choices = null;
  const res = submit(w, g, 74, 1000, '2026-10-09');
  assert.equal(res.tag, 'forgot_carry');
  assert.equal(res.row.mistake_tag, 'forgot_carry');
});
