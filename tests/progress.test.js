// tests/progress.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { newProgress, nextQuestion, recordAnswer } from '../js/progress.js';

const seq = values => { let i = 0; return () => values[i++ % values.length]; };

test('starts at addition step 1 and times group 0, choice mode', () => {
  const p = newProgress();
  assert.deepEqual([p.add.level, p.add.mode, p.times.level, p.times.mode], [1, 'choice', 0, 'choice']);
});

test('steps 1-2 unlock keypad after 5 right in a row', () => {
  const p = newProgress();
  let ev;
  for (let i = 0; i < 5; i++) ev = recordAnswer(p, { track: 'add', level: 1, key: `k${i}` }, true).event;
  assert.equal(ev, 'keypad_unlocked');
  assert.equal(p.add.mode, 'keypad');
  assert.deepEqual(p.add.recent, []);
});

test('step 3 needs 8 of the last 10', () => {
  const p = newProgress(); p.add.level = 3;
  const answers = [true, false, true, true, true, false, true, true, true];
  for (const [i, a] of answers.entries()) assert.equal(recordAnswer(p, { track: 'add', level: 3, key: `k${i}` }, a).event, null);
  assert.equal(recordAnswer(p, { track: 'add', level: 3, key: 'k9' }, true).event, 'keypad_unlocked');
});

test('7 of 10 is not enough', () => {
  const p = newProgress(); p.add.level = 3;
  const answers = [true, false, true, false, true, false, true, true, true, true];
  let last; for (const [i, a] of answers.entries()) last = recordAnswer(p, { track: 'add', level: 3, key: `k${i}` }, a).event;
  assert.equal(last, null);
  assert.equal(p.add.mode, 'choice');
});

test('keypad mastery moves to the next step in choice mode', () => {
  const p = newProgress(); p.add.level = 3; p.add.mode = 'keypad';
  let ev; for (let i = 0; i < 10; i++) ev = recordAnswer(p, { track: 'add', level: 3, key: `k${i}` }, true).event;
  assert.equal(ev, 'level_up');
  assert.deepEqual([p.add.level, p.add.mode], [4, 'choice']);
});

test('the top step stays the top step', () => {
  const p = newProgress(); p.add.level = 6; p.add.mode = 'keypad';
  for (let i = 0; i < 10; i++) recordAnswer(p, { track: 'add', level: 6, key: `k${i}` }, true);
  assert.equal(p.add.level, 6);
});

test('review answers from a lower step do not move the current window', () => {
  const p = newProgress(); p.add.level = 4;
  recordAnswer(p, { track: 'add', level: 2, key: 'x' }, true);
  assert.deepEqual(p.add.recent, []);
});

test('a wrong answer returns 2 questions later, then until right twice in a row', () => {
  const p = newProgress();
  const q = { track: 'add', level: 1, a: 30, b: 40, answer: 70, key: '30+40', text: '30 + 40' };
  recordAnswer(p, q, false);                    // counter 1, due 3
  assert.equal(p.retry.length, 1);
  assert.notEqual(nextQuestion(p, 'add', seq([0.9])).key, '30+40'); // counter 1: not due
  p.counter = 3;
  assert.equal(nextQuestion(p, 'add').key, '30+40');
  recordAnswer(p, q, true);
  assert.equal(p.retry[0].rightInRow, 1);
  p.counter = p.retry[0].due;
  recordAnswer(p, q, true);
  assert.equal(p.retry.length, 0);
});

test('a wrong answer after one right resets the run', () => {
  const p = newProgress();
  const q = { track: 'add', level: 1, a: 30, b: 40, answer: 70, key: '30+40', text: '30 + 40' };
  recordAnswer(p, q, false); recordAnswer(p, q, true); recordAnswer(p, q, false);
  assert.equal(p.retry.length, 1);
  assert.equal(p.retry[0].rightInRow, 0);
});

test('nextQuestion uses the current step and its mode', () => {
  const p = newProgress(); p.add.level = 5; p.add.mode = 'keypad';
  const q = nextQuestion(p, 'add', seq([0.1, 0.5, 0.5, 0.5, 0.5, 0.5]));
  assert.equal(q.level, 5);
  assert.equal(q.mode, 'keypad');
});

test('review questions come from a lower step and use the keypad', () => {
  const p = newProgress(); p.add.level = 5;
  const q = nextQuestion(p, 'add', seq([0.95, 0.1, 0.5, 0.5, 0.5, 0.5, 0.5]));
  assert.ok(q.level < 5);
  assert.equal(q.mode, 'keypad');
});

test('nextQuestion avoids repeating the previous key', () => {
  const p = newProgress();
  for (let i = 0; i < 200; i++) {
    const first = nextQuestion(p, 'times');
    assert.notEqual(nextQuestion(p, 'times', Math.random, first.key).key, first.key);
  }
});
