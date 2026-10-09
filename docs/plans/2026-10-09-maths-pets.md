# Maths Pets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tablet web game in which a Year 3 child practises two-digit addition with carrying and times tables by collecting animal friends and furnishing their house, with answers logged to Supabase and a daily 20:00 report to the parent in the Claude app.

**Architecture:** Static site (HTML + CSS + ES modules, no build step) on GitHub Pages, installable and playable offline through a service worker. All game logic sits in pure modules (`maths`, `progress`, `rewards`, `walk`) tested with `node --test`; screens are thin DOM code over them. Every answer goes into an on-device outbox and is sent to an insert-only RPC in the `chaloklum-villa` Supabase project; a local scheduled task reads those rows each evening and writes the report.

**Tech Stack:** Vanilla JS (ES2022 modules), CSS, Web Audio API, Service Worker, Node 24 `node:test`, Supabase Postgres (RPC via PostgREST), Higgsfield `gpt_image_2_5` + `remove_background` for art, `cwebp` for compression, GitHub Pages.

**Spec:** `docs/specs/2026-10-09-maths-pets-design.md`

## Global Constraints

- UI language: English. Parent-facing report: Russian.
- No build step, no npm dependencies. `package.json` only sets `"type": "module"` and the test script.
- Target: Chrome on an Android tablet, both orientations, no page scroll on game screens. Touch targets at least 64 px.
- Walk = 10 questions: 6 addition, 4 times tables. Daily goal = 20 walk answers.
- Treats: +2 for a correct answer, +1 after finishing a hint.
- Choice → keypad after 8 of the last 10 correct at the current step; keypad → next step after 8 of the last 10. Steps 1–2 of addition use 5 of the last 5.
- A wrong question returns 2 questions later and keeps returning until answered right twice in a row.
- New friend guaranteed at least once every 5 walks.
- Streak: one missed day forgiven per ISO week, only when the streak is already 3 or more.
- No timer anywhere except Zoomies (60 s, times tables, keypad only, does not move progression).
- The child's name never leaves the device. Outbox rows carry only: device id, timestamps, mode, track, level, question, correct answer, given answer, correct flag, input kind, mistake tag, hint used, seconds.
- Supabase: project `chaloklum-villa` (ref `bsywzzzzizfvmuerqlqr`), schema `maths_pets`, never the `Tender` project.
- Device timezone and report timezone: UTC+7 (the Mac's zone).
- Nothing in the report is invented: every figure comes from rows; if there are too few rows, the report says so.

## Review Focus

1. **Tablet rotated or a different screen size** — every game screen fits without scrolling, portrait and landscape. Pinned by the viewport check in Task 9, Step 6.
2. **Offline play** — answers queue on the device and send later; no error reaches the child; nothing is lost or sent twice. Pinned by the reporter tests in Task 6.
3. **Playing across midnight / a new day** — the daily counter restarts on the new local date, and the streak uses local dates. Pinned by the rewards tests in Task 4.
4. **First run, cleared storage or corrupted save** — the game starts fresh without crashing. Pinned by the storage tests in Task 5.
5. **Fast double tap on an answer** — only one answer is recorded per question. Pinned by the walk tests in Task 7.

---

## File Structure

```
maths-pets/
  index.html              app shell, one <main id="app">
  styles.css              all styles, CSS variables, layout for both orientations
  manifest.webmanifest    install metadata
  sw.js                   service worker: cache-first app shell + assets
  package.json            {"type":"module","scripts":{"test":"node --test tests/"}}
  js/
    maths.js              question generation, distractors, hint steps (pure)
    progress.js           steps, choice→keypad, retry queue, nextQuestion (pure)
    rewards.js            treats, chest, shop, daily goal, streak (pure)
    catalog.js            friends, items, rooms, prices (data)
    walk.js               one walk as a state machine (pure)
    storage.js            load/save game state with fallback (injectable storage)
    reporter.js           outbox + send to Supabase (injectable fetch/storage)
    config.js             Supabase URL + publishable key
    sound.js              Web Audio blips + mute
    app.js                screen router, wires everything together
    ui/start.js           first run: name + first friend
    ui/hub.js             main screen: friend, daily goal, streak, buttons
    ui/walkScreen.js      question, choices/keypad, hint, chest
    ui/home.js            rooms, placing items, wandering friends
    ui/shop.js            buy items and friends
    ui/zoomies.js         60-second times-tables sprint
    ui/keypad.js          shared big keypad component
  assets/
    friends/*.webp        15 friends, transparent
    items/*.webp          20 items, transparent
    rooms/*.webp          2 room backgrounds
  supabase/
    001_maths_pets.sql    schema, table, RPC
  report/
    report.sql            the queries the daily report runs
    prompt.md             the scheduled task's prompt
  tests/
    maths.test.js progress.test.js rewards.test.js walk.test.js
    storage.test.js reporter.test.js
```

---

### Task 1: Project skeleton and test runner

**Files:**
- Create: `package.json`, `.gitignore`, `tests/smoke.test.js`

**Interfaces:**
- Produces: `npm test` runs every `tests/*.test.js` with `node --test`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "maths-pets",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test tests/" }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
.DS_Store
art-raw/
```

- [ ] **Step 3: Write a smoke test**

```js
// tests/smoke.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
test('runner works', () => assert.equal(1 + 1, 2));
```

- [ ] **Step 4: Run** `npm test` — Expected: 1 pass.

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore tests/smoke.test.js
git commit -m "Project skeleton and test runner"
```

---

### Task 2: `maths.js` — questions, distractors, hints

**Files:**
- Create: `js/maths.js`
- Test: `tests/maths.test.js`

**Interfaces:**
- Produces:
  - `TIMES_GROUPS: number[][]` = `[[2,5,10],[3,4,8],[6,7,9,11,12]]`
  - `ADD_MAX_LEVEL = 6`
  - `makeAddition(level: 1..6, rand?) -> Question`
  - `makeTimes(group: 0..2, rand?) -> Question`
  - `Question = { track:'add'|'times', level:number, a:number, b:number, answer:number, key:string, text:string }` — for times `level` is the group index, `key` is `"min x max"` so 7×8 and 8×7 are one fact; `text` is `"59 + 25"` or `"7 × 8"`.
  - `makeChoices(q, rand?) -> {value:number, tag:string|null}[]` — 4 entries, exactly one with `tag === null` (the right answer), shuffled.
  - `hintSteps(q) -> {label:string, prompt:string, answer:number}[]`

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run** `npm test` — Expected: FAIL, cannot find `js/maths.js`.

- [ ] **Step 3: Implement `js/maths.js`**

```js
// js/maths.js — what to ask, which wrong answers to offer, how to break a question into steps.
export const TIMES_GROUPS = [[2, 5, 10], [3, 4, 8], [6, 7, 9, 11, 12]];
export const ADD_MAX_LEVEL = 6;

const int = (lo, hi, rand) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];

function addQ(level, a, b) {
  return { track: 'add', level, a, b, answer: a + b, key: `${a}+${b}`, text: `${a} + ${b}` };
}

export function makeAddition(level, rand = Math.random) {
  switch (level) {
    case 1: { const t1 = int(1, 9, rand); const t2 = int(1, 10 - t1, rand); return addQ(1, t1 * 10, t2 * 10); }
    case 2: { const t = int(1, 9, rand), o = int(0, 8, rand); return addQ(2, t * 10 + o, int(1, 9 - o, rand)); }
    case 3: { const t = int(1, 8, rand), o = int(1, 9, rand); return addQ(3, t * 10 + o, int(10 - o, 9, rand)); }
    case 4: {
      const t1 = int(1, 8, rand), t2 = int(1, 9 - t1, rand);
      const o1 = int(0, 9, rand), o2 = int(0, 9 - o1, rand);
      return addQ(4, t1 * 10 + o1, t2 * 10 + o2);
    }
    case 5: {
      const t1 = int(1, 7, rand), t2 = int(1, 8 - t1, rand);
      const o1 = int(1, 9, rand), o2 = int(10 - o1, 9, rand);
      return addQ(5, t1 * 10 + o1, t2 * 10 + o2);
    }
    case 6: {
      for (;;) { const a = int(11, 99, rand), b = int(11, 99, rand); if (a + b > 100) return addQ(6, a, b); }
    }
    default: throw new Error(`unknown addition level ${level}`);
  }
}

export function makeTimes(group, rand = Math.random) {
  const table = pick(TIMES_GROUPS[group], rand), other = int(1, 12, rand);
  const [a, b] = rand() < 0.5 ? [other, table] : [table, other];
  return { track: 'times', level: group, a, b, answer: a * b, key: `${Math.min(a, b)}x${Math.max(a, b)}`, text: `${a} × ${b}` };
}

function wrongAdditions(q) {
  const onesSum = (q.a % 10) + (q.b % 10);
  const tensSum = Math.floor(q.a / 10) + Math.floor(q.b / 10);
  const out = [];
  if (onesSum >= 10) {
    out.push({ value: q.answer - 10, tag: 'forgot_carry' });
    out.push({ value: Number(`${tensSum}${onesSum}`), tag: 'side_by_side' });
  }
  out.push({ value: q.answer + 10, tag: 'extra_ten' });
  out.push({ value: q.answer + 1, tag: 'off_by_one' }, { value: q.answer - 1, tag: 'off_by_one' });
  out.push({ value: q.answer - 10, tag: 'off_by_ten' }, { value: q.answer + 2, tag: 'off_by_one' });
  return out;
}

function wrongTimes(q) {
  return [
    { value: q.a * (q.b + 1), tag: 'neighbour_fact' }, { value: q.a * (q.b - 1), tag: 'neighbour_fact' },
    { value: (q.a + 1) * q.b, tag: 'neighbour_fact' }, { value: (q.a - 1) * q.b, tag: 'neighbour_fact' },
    { value: q.a + q.b, tag: 'added_instead' },
    { value: q.answer + 1, tag: 'off_by_one' }, { value: q.answer - 1, tag: 'off_by_one' },
    { value: q.answer + 10, tag: 'off_by_ten' }, { value: q.answer + 2, tag: 'off_by_one' },
  ];
}

export function makeChoices(q, rand = Math.random) {
  const seen = new Set([q.answer]);
  const wrong = [];
  for (const w of q.track === 'add' ? wrongAdditions(q) : wrongTimes(q)) {
    if (wrong.length === 3) break;
    if (w.value > 0 && !seen.has(w.value)) { seen.add(w.value); wrong.push(w); }
  }
  const all = [{ value: q.answer, tag: null }, ...wrong];
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return all;
}

export function hintSteps(q) {
  if (q.track === 'times') {
    const table = Math.max(q.a, q.b), count = Math.min(q.a, q.b);
    const seq = Array.from({ length: count }, (_, i) => (i + 1) * table);
    return [{ label: `Count in ${table}s`, prompt: [...seq.slice(0, -1), '?'].join(', '), answer: q.answer }];
  }
  const ta = Math.floor(q.a / 10) * 10, oa = q.a % 10, tb = Math.floor(q.b / 10) * 10, ob = q.b % 10;
  if (oa === 0 && ob === 0) {
    const n = ta / 10 + tb / 10;
    return [
      { label: 'Add the tens', prompt: `${ta / 10} + ${tb / 10}`, answer: n },
      { label: 'That many tens is', prompt: `${n} tens`, answer: n * 10 },
    ];
  }
  if (q.b < 10) {
    return [
      { label: 'Add the ones', prompt: `${oa} + ${q.b}`, answer: oa + q.b },
      { label: 'Add the tens back', prompt: `${ta} + ${oa + q.b}`, answer: q.answer },
    ];
  }
  return [
    { label: 'Add the tens', prompt: `${ta} + ${tb}`, answer: ta + tb },
    { label: 'Add the ones', prompt: `${oa} + ${ob}`, answer: oa + ob },
    { label: 'Put them together', prompt: `${ta + tb} + ${oa + ob}`, answer: q.answer },
  ];
}
```

Note on `hintSteps` for times: she counts in the larger factor, the smaller number of times — the shortest sequence (4×8 → "8, 16, 24, ?"). For ×1 the prompt is just "?".

- [ ] **Step 4: Run** `npm test` — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add js/maths.js tests/maths.test.js
git commit -m "Questions, typical-mistake choices and hint steps"
```

---

### Task 3: `progress.js` — steps, input mode, retry queue

**Files:**
- Create: `js/progress.js`
- Test: `tests/progress.test.js`

**Interfaces:**
- Consumes: `makeAddition`, `makeTimes`, `ADD_MAX_LEVEL`, `TIMES_GROUPS` from Task 2.
- Produces:
  - `newProgress() -> Progress` where `Progress = { add:{level, mode:'choice'|'keypad', recent:boolean[]}, times:{level, mode, recent}, retry: RetryItem[], counter:number }`, `RetryItem = { q:Question, due:number, rightInRow:number }`
  - `nextQuestion(p, track, rand?, avoidKey?) -> Question & { mode:'choice'|'keypad' }` — returns a due retry item of that track first, else 70% current level / 30% a lower level.
  - `recordAnswer(p, q, correct:boolean) -> { event: null | 'keypad_unlocked' | 'level_up' }` — mutates `p`.

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run** `npm test` — Expected: FAIL, cannot find `js/progress.js`.

- [ ] **Step 3: Implement `js/progress.js`**

```js
// js/progress.js — which step she is on, whether she picks or types, and which mistakes come back.
import { makeAddition, makeTimes, ADD_MAX_LEVEL, TIMES_GROUPS } from './maths.js';

const MAX_LEVEL = { add: ADD_MAX_LEVEL, times: TIMES_GROUPS.length - 1 };
const RETRY_GAP_WRONG = 2;
const RETRY_GAP_RIGHT = 10;

export function newProgress() {
  return {
    add: { level: 1, mode: 'choice', recent: [] },
    times: { level: 0, mode: 'choice', recent: [] },
    retry: [],
    counter: 0,
  };
}

function rule(track, level) {
  return track === 'add' && level <= 2 ? { window: 5, need: 5 } : { window: 10, need: 8 };
}

function make(track, level, rand) {
  return track === 'add' ? makeAddition(level, rand) : makeTimes(level, rand);
}

function minLevel(track) { return track === 'add' ? 1 : 0; }

export function nextQuestion(p, track, rand = Math.random, avoidKey = null) {
  const t = p[track];
  const due = p.retry.find(r => r.q.track === track && r.due <= p.counter && r.q.key !== avoidKey);
  if (due) return { ...due.q, mode: due.q.level === t.level ? t.mode : 'keypad' };
  for (let tries = 0; tries < 20; tries++) {
    const review = t.level > minLevel(track) && rand() >= 0.7;
    const level = review ? minLevel(track) + Math.floor(rand() * (t.level - minLevel(track))) : t.level;
    const q = make(track, level, rand);
    if (q.key !== avoidKey || tries === 19) return { ...q, mode: review ? 'keypad' : t.mode };
  }
}

export function recordAnswer(p, q, correct) {
  p.counter += 1;
  const { mode, ...plain } = q;
  const r = p.retry.find(x => x.q.key === q.key && x.q.track === q.track);
  if (!correct) {
    if (r) { r.rightInRow = 0; r.due = p.counter + RETRY_GAP_WRONG; }
    else p.retry.push({ q: plain, due: p.counter + RETRY_GAP_WRONG, rightInRow: 0 });
  } else if (r) {
    r.rightInRow += 1;
    if (r.rightInRow >= 2) p.retry.splice(p.retry.indexOf(r), 1);
    else r.due = p.counter + RETRY_GAP_RIGHT;
  }

  const t = p[q.track];
  if (q.level !== t.level) return { event: null };
  const { window, need } = rule(q.track, t.level);
  t.recent.push(correct);
  if (t.recent.length > window) t.recent.shift();
  if (t.recent.length < window || t.recent.filter(Boolean).length < need) return { event: null };

  t.recent = [];
  if (t.mode === 'choice') { t.mode = 'keypad'; return { event: 'keypad_unlocked' }; }
  if (t.level < MAX_LEVEL[q.track]) { t.level += 1; t.mode = 'choice'; return { event: 'level_up' }; }
  return { event: null };
}
```

- [ ] **Step 4: Run** `npm test` — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add js/progress.js tests/progress.test.js
git commit -m "Steps, choice-to-keypad and the retry queue"
```

---

### Task 4: `catalog.js` + `rewards.js` — treats, chest, shop, daily goal, streak

**Files:**
- Create: `js/catalog.js`, `js/rewards.js`
- Test: `tests/rewards.test.js`

**Interfaces:**
- Produces:
  - `FRIENDS: {id, name, species, price}[]` (15), `ITEMS: {id, name, room:'living'|'garden', price}[]` (20), `ROOMS: {id, name}[]`, `STARTERS: string[]` (ids of the 3 friends offered on first run).
  - `newRewards() -> Rewards` where `Rewards = { treats, friends:string[], items:string[], placed:{[room]:{id,x,y}[]}, walksSinceFriend, daily:{date, count, goalMet}, streak:{count, lastDate, freezeWeek}, zoomiesBest }`
  - `DAILY_GOAL = 20`, `TREATS_RIGHT = 2`, `TREATS_HINT = 1`
  - `addTreats(r, n)`
  - `countAnswer(r, today:'YYYY-MM-DD') -> { goalJustMet:boolean }`
  - `openChest(r, rand?, {double}?) -> { prizes: {type:'friend'|'item'|'treats', id?, amount?}[] }`
  - `buy(r, type:'friend'|'item', id) -> { ok:boolean, reason?:'owned'|'not_enough'|'unknown' }`
  - `localDate(date:Date) -> 'YYYY-MM-DD'` in the device's local zone.

- [ ] **Step 1: Create `js/catalog.js`**

```js
// js/catalog.js — every friend and thing she can collect, with prices in treats.
export const FRIENDS = [
  { id: 'biscuit', name: 'Biscuit', species: 'dachshund', price: 150 },
  { id: 'pepper', name: 'Pepper', species: 'dachshund', price: 150 },
  { id: 'noodle', name: 'Noodle', species: 'dachshund', price: 150 },
  { id: 'mittens', name: 'Mittens', species: 'cat', price: 150 },
  { id: 'ginger', name: 'Ginger', species: 'cat', price: 150 },
  { id: 'luna', name: 'Luna', species: 'cat', price: 150 },
  { id: 'gigi', name: 'Gigi', species: 'giraffe', price: 150 },
  { id: 'stretch', name: 'Stretch', species: 'giraffe', price: 150 },
  { id: 'sunny', name: 'Sunny', species: 'giraffe', price: 150 },
  { id: 'kiki', name: 'Kiki', species: 'koala', price: 150 },
  { id: 'gumnut', name: 'Gumnut', species: 'koala', price: 150 },
  { id: 'snooze', name: 'Snooze', species: 'koala', price: 150 },
  { id: 'bandit', name: 'Bandit', species: 'raccoon', price: 150 },
  { id: 'pip', name: 'Pip', species: 'raccoon', price: 150 },
  { id: 'rocky', name: 'Rocky', species: 'raccoon', price: 150 },
];
export const STARTERS = ['biscuit', 'mittens', 'kiki'];

export const ROOMS = [{ id: 'living', name: 'Living room' }, { id: 'garden', name: 'Garden' }];

export const ITEMS = [
  { id: 'sofa', name: 'Comfy sofa', room: 'living', price: 70 },
  { id: 'rug', name: 'Rainbow rug', room: 'living', price: 40 },
  { id: 'lamp', name: 'Star lamp', room: 'living', price: 40 },
  { id: 'bookshelf', name: 'Bookshelf', room: 'living', price: 70 },
  { id: 'dogbed', name: 'Dog bed', room: 'living', price: 40 },
  { id: 'cattower', name: 'Cat tower', room: 'living', price: 70 },
  { id: 'piano', name: 'Little piano', room: 'living', price: 120 },
  { id: 'fishtank', name: 'Fish tank', room: 'living', price: 120 },
  { id: 'plant', name: 'Pot plant', room: 'living', price: 40 },
  { id: 'cushions', name: 'Cushion pile', room: 'living', price: 40 },
  { id: 'tree', name: 'Eucalyptus tree', room: 'garden', price: 70 },
  { id: 'swing', name: 'Swing', room: 'garden', price: 70 },
  { id: 'pond', name: 'Duck pond', room: 'garden', price: 120 },
  { id: 'flowers', name: 'Flower bed', room: 'garden', price: 40 },
  { id: 'kennel', name: 'Kennel', room: 'garden', price: 70 },
  { id: 'trampoline', name: 'Trampoline', room: 'garden', price: 120 },
  { id: 'bench', name: 'Garden bench', room: 'garden', price: 40 },
  { id: 'mushrooms', name: 'Toadstools', room: 'garden', price: 40 },
  { id: 'treehouse', name: 'Treehouse', room: 'garden', price: 120 },
  { id: 'picnic', name: 'Picnic blanket', room: 'garden', price: 40 },
];
```

- [ ] **Step 2: Write the failing tests**

```js
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
```

- [ ] **Step 3: Run** `npm test` — Expected: FAIL, cannot find `js/rewards.js`.

- [ ] **Step 4: Implement `js/rewards.js`**

```js
// js/rewards.js — treats, the chest, the shop, the daily goal and the streak.
import { FRIENDS, ITEMS } from './catalog.js';

export const DAILY_GOAL = 20;
export const TREATS_RIGHT = 2;
export const TREATS_HINT = 1;
const FRIEND_EVERY = 5;
const FRIEND_CHANCE = 0.25;
const TREATS_WHEN_ALL_OWNED = 10;

export function newRewards() {
  return {
    treats: 0, friends: [], items: [], placed: { living: [], garden: [] },
    walksSinceFriend: 0,
    daily: { date: null, count: 0, goalMet: false },
    streak: { count: 0, lastDate: null, freezeWeek: null },
    zoomiesBest: 0,
  };
}

export function addTreats(r, n) { r.treats += n; }

export function localDate(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const toDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
function isoWeek(s) {
  const d = toDate(s); const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = d.getUTCFullYear(); const start = Date.UTC(y, 0, 1);
  return `${y}-W${Math.ceil(((d - start) / 86400000 + 1) / 7)}`;
}

function extendStreak(r, today) {
  const s = r.streak;
  const gap = s.lastDate ? daysBetween(s.lastDate, today) : null;
  if (gap === 1) s.count += 1;
  else if (gap === 2 && s.count >= 3 && s.freezeWeek !== isoWeek(today)) { s.count += 1; s.freezeWeek = isoWeek(today); }
  else if (gap !== 0) s.count = 1;
  s.lastDate = today;
}

export function countAnswer(r, today) {
  if (r.daily.date !== today) r.daily = { date: today, count: 0, goalMet: false };
  r.daily.count += 1;
  if (!r.daily.goalMet && r.daily.count >= DAILY_GOAL) {
    r.daily.goalMet = true;
    extendStreak(r, today);
    return { goalJustMet: true };
  }
  return { goalJustMet: false };
}

const pickFrom = (arr, rand) => arr[Math.floor(rand() * arr.length)];

function onePrize(r, rand) {
  const freeFriends = FRIENDS.filter(f => !r.friends.includes(f.id));
  const freeItems = ITEMS.filter(i => !r.items.includes(i.id));
  r.walksSinceFriend += 1;
  const friendDue = r.walksSinceFriend >= FRIEND_EVERY || rand() < FRIEND_CHANCE;
  if (freeFriends.length && (friendDue || !freeItems.length)) {
    const f = pickFrom(freeFriends, rand); r.friends.push(f.id); r.walksSinceFriend = 0;
    return { type: 'friend', id: f.id };
  }
  if (freeItems.length) { const i = pickFrom(freeItems, rand); r.items.push(i.id); return { type: 'item', id: i.id }; }
  addTreats(r, TREATS_WHEN_ALL_OWNED);
  return { type: 'treats', amount: TREATS_WHEN_ALL_OWNED };
}

export function openChest(r, rand = Math.random, { double = false } = {}) {
  const prizes = [onePrize(r, rand)];
  if (double) prizes.push(onePrize(r, rand));
  return { prizes };
}

export function buy(r, type, id) {
  const list = type === 'friend' ? FRIENDS : ITEMS;
  const owned = type === 'friend' ? r.friends : r.items;
  const thing = list.find(x => x.id === id);
  if (!thing) return { ok: false, reason: 'unknown' };
  if (owned.includes(id)) return { ok: false, reason: 'owned' };
  if (r.treats < thing.price) return { ok: false, reason: 'not_enough' };
  r.treats -= thing.price; owned.push(id);
  return { ok: true };
}
```

Note: the chest test "friend at the latest on the 5th walk" counts walks *after* the last friend; `walksSinceFriend` increments before the check, so the 5th chest (`walksSinceFriend === 5`) forces a friend.

- [ ] **Step 5: Run** `npm test` — Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add js/catalog.js js/rewards.js tests/rewards.test.js
git commit -m "Treats, chest, shop, daily goal and streak"
```

---

### Task 5: `storage.js` — save and load with a safe fallback

**Files:**
- Create: `js/storage.js`
- Test: `tests/storage.test.js`

**Interfaces:**
- Consumes: `newProgress()` (Task 3), `newRewards()` (Task 4).
- Produces:
  - `SAVE_KEY = 'maths-pets-v1'`
  - `newGame() -> Game` where `Game = { name:string|null, activeFriend:string|null, muted:boolean, progress:Progress, rewards:Rewards }`
  - `loadGame(store = globalThis.localStorage) -> Game` — never throws; missing, unreadable or corrupted → `newGame()`; missing nested fields filled from defaults.
  - `saveGame(game, store = globalThis.localStorage) -> boolean` — never throws.

- [ ] **Step 1: Write the failing tests**

```js
// tests/storage.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, saveGame, newGame, SAVE_KEY } from '../js/storage.js';

const memStore = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
};
const throwingStore = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };

test('first run gives a fresh game', () => {
  assert.deepEqual(loadGame(memStore()), newGame());
});

test('corrupted save gives a fresh game instead of crashing', () => {
  assert.deepEqual(loadGame(memStore({ [SAVE_KEY]: '{not json' })), newGame());
});

test('blocked storage gives a fresh game and save reports false', () => {
  assert.deepEqual(loadGame(throwingStore), newGame());
  assert.equal(saveGame(newGame(), throwingStore), false);
});

test('a save round-trips', () => {
  const s = memStore(); const g = newGame(); g.name = 'Mia'; g.rewards.treats = 42;
  assert.equal(saveGame(g, s), true);
  assert.deepEqual(loadGame(s), g);
});

test('an older save missing new fields is filled from defaults', () => {
  const s = memStore({ [SAVE_KEY]: JSON.stringify({ name: 'Mia', rewards: { treats: 5 } }) });
  const g = loadGame(s);
  assert.equal(g.name, 'Mia');
  assert.equal(g.rewards.treats, 5);
  assert.deepEqual(g.rewards.placed, { living: [], garden: [] });
  assert.equal(g.progress.add.level, 1);
});
```

- [ ] **Step 2: Run** `npm test` — Expected: FAIL.

- [ ] **Step 3: Implement `js/storage.js`**

```js
// js/storage.js — keeps the game on this tablet; a broken save never stops her playing.
import { newProgress } from './progress.js';
import { newRewards } from './rewards.js';

export const SAVE_KEY = 'maths-pets-v1';

export function newGame() {
  return { name: null, activeFriend: null, muted: false, progress: newProgress(), rewards: newRewards() };
}

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function fill(defaults, saved) {
  if (!isObj(defaults) || !isObj(saved)) return saved === undefined ? defaults : saved;
  const out = { ...defaults };
  for (const k of Object.keys(saved)) out[k] = k in defaults ? fill(defaults[k], saved[k]) : saved[k];
  return out;
}

export function loadGame(store = globalThis.localStorage) {
  try {
    const raw = store?.getItem(SAVE_KEY);
    if (!raw) return newGame();
    const saved = JSON.parse(raw);
    return isObj(saved) ? fill(newGame(), saved) : newGame();
  } catch { return newGame(); }
}

export function saveGame(game, store = globalThis.localStorage) {
  try { store.setItem(SAVE_KEY, JSON.stringify(game)); return true; } catch { return false; }
}
```

- [ ] **Step 4: Run** `npm test` — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add js/storage.js tests/storage.test.js
git commit -m "Save and load with a safe fallback"
```

---

### Task 6: Supabase table + `reporter.js` outbox

**Files:**
- Create: `supabase/001_maths_pets.sql`, `js/config.js`, `js/reporter.js`
- Test: `tests/reporter.test.js`

**Interfaces:**
- Produces:
  - RPC `public.maths_pets_log(p_rows jsonb) returns integer` — inserts rows, returns how many.
  - `createReporter({ url, key, store, fetchFn, now, uuid }) -> { log(row), flush(): Promise<number>, pending(): number, deviceId:string }`
  - `row` fields (client side): `{ mode:'walk'|'zoomies', track:'add'|'times', level, question, correct_answer, given_answer, is_correct, input_kind:'choice'|'keypad', mistake_tag, hint_used, seconds }`; `log` adds `client_id` (uuid, for de-duplication), `device_id`, `answered_at` (ISO).

- [ ] **Step 1: Security check before the publishable key goes public**

The publishable key of `chaloklum-villa` will be visible in the page source. Run the Supabase security advisors for project `bsywzzzzizfvmuerqlqr` and list tables in `public` with RLS state. If any table is readable or writable by `anon` beyond what the villa site already exposes on purpose, **stop and tell Egor** before going on.

- [ ] **Step 2: Write the migration**

```sql
-- supabase/001_maths_pets.sql
create schema if not exists maths_pets;
revoke all on schema maths_pets from public, anon, authenticated;

create table maths_pets.answers (
  id bigint generated always as identity primary key,
  client_id uuid not null unique,
  device_id uuid not null,
  answered_at timestamptz not null,
  received_at timestamptz not null default now(),
  mode text not null check (mode in ('walk', 'zoomies')),
  track text not null check (track in ('add', 'times')),
  level smallint not null check (level between 0 and 6),
  question text not null check (length(question) <= 20),
  correct_answer integer not null,
  given_answer integer,
  is_correct boolean not null,
  input_kind text not null check (input_kind in ('choice', 'keypad')),
  mistake_tag text check (length(mistake_tag) <= 30),
  hint_used boolean not null default false,
  seconds numeric(6,1) check (seconds >= 0 and seconds < 3600)
);
alter table maths_pets.answers enable row level security;
create index on maths_pets.answers (answered_at);

create or replace function public.maths_pets_log(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 100 then
    raise exception 'bad batch';
  end if;
  insert into maths_pets.answers (client_id, device_id, answered_at, mode, track, level, question,
    correct_answer, given_answer, is_correct, input_kind, mistake_tag, hint_used, seconds)
  select (r->>'client_id')::uuid, (r->>'device_id')::uuid, (r->>'answered_at')::timestamptz,
    r->>'mode', r->>'track', (r->>'level')::smallint, r->>'question',
    (r->>'correct_answer')::integer, (r->>'given_answer')::integer, (r->>'is_correct')::boolean,
    r->>'input_kind', r->>'mistake_tag', coalesce((r->>'hint_used')::boolean, false), (r->>'seconds')::numeric
  from jsonb_array_elements(p_rows) r
  on conflict (client_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.maths_pets_log(jsonb) from public;
grant execute on function public.maths_pets_log(jsonb) to anon;
```

`on conflict (client_id) do nothing` makes a resend after a lost response harmless.

- [ ] **Step 3: Apply the migration** with the Supabase `apply_migration` tool, project `bsywzzzzizfvmuerqlqr`, name `maths_pets_answers`. Then prove it: call the RPC with one test row via `execute_sql` as `select public.maths_pets_log('[...]'::jsonb)`, check it returns 1, call again with the same `client_id`, check it returns 0; then `select has_table_privilege('anon','maths_pets.answers','select')` returns false. Delete the test row.

- [ ] **Step 4: Create `js/config.js`** with the project URL and publishable key fetched via `get_project_url` / `get_publishable_keys`:

```js
// js/config.js — where answers are sent. The key can only call maths_pets_log.
export const SUPABASE_URL = 'https://bsywzzzzizfvmuerqlqr.supabase.co';
export const SUPABASE_KEY = '<publishable key from get_publishable_keys>';
```

(The executor writes the actual key value here; it is a publishable key, safe in page source once Step 1 passed.)

- [ ] **Step 5: Write the failing reporter tests**

```js
// tests/reporter.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createReporter } from '../js/reporter.js';

const memStore = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
let n = 0; const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const row = { mode: 'walk', track: 'add', level: 5, question: '59 + 25', correct_answer: 84, given_answer: 74,
  is_correct: false, input_kind: 'choice', mistake_tag: 'forgot_carry', hint_used: true, seconds: 6.2 };

function make(fetchFn, store = memStore()) {
  return createReporter({ url: 'https://x.supabase.co', key: 'k', store, fetchFn, now: () => new Date('2026-10-09T10:00:00Z'), uuid });
}

test('offline: answers wait in the outbox and nothing throws', async () => {
  const r = make(async () => { throw new TypeError('offline'); });
  r.log(row); r.log(row);
  assert.equal(await r.flush(), 0);
  assert.equal(r.pending(), 2);
});

test('back online: the outbox is sent once and emptied', async () => {
  const calls = [];
  let online = false;
  const r = make(async (url, opts) => {
    if (!online) throw new TypeError('offline');
    calls.push(JSON.parse(opts.body));
    return { ok: true, json: async () => 2 };
  });
  r.log(row); r.log(row);
  await r.flush();
  online = true;
  assert.equal(await r.flush(), 2);
  assert.equal(r.pending(), 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].p_rows.length, 2);
  assert.equal(await r.flush(), 0);
  assert.equal(calls.length, 1);
});

test('rows carry device id, client id and time, never a name', async () => {
  let sent;
  const r = make(async (url, opts) => { sent = JSON.parse(opts.body).p_rows[0]; return { ok: true, json: async () => 1 }; });
  r.log({ ...row, name: 'Mia' });
  await r.flush();
  assert.equal(sent.device_id, r.deviceId);
  assert.match(sent.client_id, /^[0-9a-f-]{36}$/);
  assert.equal(sent.answered_at, '2026-10-09T10:00:00.000Z');
  assert.equal('name' in sent, false);
});

test('a server error keeps the rows for later', async () => {
  const r = make(async () => ({ ok: false, status: 500, json: async () => ({}) }));
  r.log(row);
  await r.flush();
  assert.equal(r.pending(), 1);
});

test('the device id survives a restart', () => {
  const store = memStore();
  const a = make(async () => ({ ok: true, json: async () => 0 }), store);
  const b = make(async () => ({ ok: true, json: async () => 0 }), store);
  assert.equal(a.deviceId, b.deviceId);
});

test('rows logged during a send are not lost', async () => {
  let release, calls = 0;
  const r = make(() => {
    calls += 1;
    if (calls === 1) return new Promise(res => { release = () => res({ ok: true, json: async () => 1 }); });
    return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
  });
  r.log(row);
  const p = r.flush();
  r.log(row);
  release(); await p;
  assert.equal(r.pending(), 1);
});
```

- [ ] **Step 6: Run** `npm test` — Expected: FAIL.

- [ ] **Step 7: Implement `js/reporter.js`**

```js
// js/reporter.js — answers wait on the tablet until the internet is there, then go to Supabase.
const OUTBOX = 'maths-pets-outbox';
const DEVICE = 'maths-pets-device';
const BATCH = 50;
const FIELDS = ['mode', 'track', 'level', 'question', 'correct_answer', 'given_answer', 'is_correct',
  'input_kind', 'mistake_tag', 'hint_used', 'seconds'];

export function createReporter({ url, key, store = globalThis.localStorage, fetchFn = globalThis.fetch?.bind(globalThis),
  now = () => new Date(), uuid = () => crypto.randomUUID() }) {
  const read = (k, d) => { try { const v = store.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const write = (k, v) => { try { store.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

  let deviceId = read(DEVICE, null);
  if (!deviceId) { deviceId = uuid(); write(DEVICE, deviceId); }
  let sending = false;

  function log(answer) {
    const r = { client_id: uuid(), device_id: deviceId, answered_at: now().toISOString() };
    for (const f of FIELDS) r[f] = answer[f] ?? null;
    write(OUTBOX, [...read(OUTBOX, []), r]);
  }

  async function flush() {
    if (sending) return 0;
    sending = true;
    let sent = 0;
    try {
      for (;;) {
        const batch = read(OUTBOX, []).slice(0, BATCH);
        if (!batch.length) break;
        const res = await fetchFn(`${url}/rest/v1/rpc/maths_pets_log`, {
          method: 'POST',
          headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_rows: batch }),
        });
        if (!res.ok) break;
        const ids = new Set(batch.map(b => b.client_id));
        write(OUTBOX, read(OUTBOX, []).filter(b => !ids.has(b.client_id)));
        sent += batch.length;
      }
    } catch { /* offline: try again later */ }
    finally { sending = false; }
    return sent;
  }

  return { log, flush, pending: () => read(OUTBOX, []).length, deviceId };
}
```

- [ ] **Step 8: Run** `npm test` — Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add supabase/001_maths_pets.sql js/config.js js/reporter.js tests/reporter.test.js
git commit -m "Answers go to Supabase through an offline outbox"
```

---

### Task 7: `walk.js` — one walk as a state machine

**Files:**
- Create: `js/walk.js`
- Test: `tests/walk.test.js`

**Interfaces:**
- Consumes: `nextQuestion`, `recordAnswer` (Task 3); `makeChoices`, `hintSteps` (Task 2); `addTreats`, `countAnswer`, `TREATS_RIGHT`, `TREATS_HINT` (Task 4).
- Produces:
  - `WALK_PLAN = { add: 6, times: 4 }`
  - `startWalk(rand?) -> Walk` where `Walk = { tracks:string[10], i:number, q:Question|null, choices:Choice[]|null, locked:boolean, startedAt:number, hint:Step[]|null, hintUsed:boolean, done:boolean, lastKey:string|null }`
  - `showNext(walk, game, now:number, rand?)` — sets `walk.q`, `walk.choices` (only in choice mode), unlocks.
  - `submit(walk, game, value:number, now:number, today:string) -> null | { correct, tag, event, goalJustMet, row }` — `null` when locked (double tap). On a wrong answer sets `walk.hint`.
  - `finishHint(walk, game)` — gives `TREATS_HINT`, clears hint.
  - `advance(walk)` — `i += 1`; sets `done` when `i === 10`.

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run** `npm test` — Expected: FAIL.

- [ ] **Step 3: Implement `js/walk.js`**

```js
// js/walk.js — one walk of 10 questions: what is on screen, what happens on each tap.
import { nextQuestion, recordAnswer } from './progress.js';
import { makeChoices, hintSteps } from './maths.js';
import { addTreats, countAnswer, TREATS_RIGHT, TREATS_HINT } from './rewards.js';

export const WALK_PLAN = { add: 6, times: 4 };

export function startWalk(rand = Math.random) {
  const tracks = [...Array(WALK_PLAN.add).fill('add'), ...Array(WALK_PLAN.times).fill('times')];
  for (let i = tracks.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [tracks[i], tracks[j]] = [tracks[j], tracks[i]]; }
  return { tracks, i: 0, q: null, choices: null, locked: true, startedAt: 0, hint: null, hintUsed: false, done: false, lastKey: null };
}

export function showNext(walk, game, now, rand = Math.random) {
  walk.q = nextQuestion(game.progress, walk.tracks[walk.i], rand, walk.lastKey);
  walk.choices = walk.q.mode === 'choice' ? makeChoices(walk.q, rand) : null;
  walk.locked = false; walk.startedAt = now; walk.hint = null; walk.hintUsed = false;
}

export function submit(walk, game, value, now, today) {
  if (walk.locked || !walk.q) return null;
  walk.locked = true;
  const q = walk.q;
  const correct = value === q.answer;
  const tag = correct ? null : (walk.choices?.find(c => c.value === value)?.tag ?? null);
  const { event } = recordAnswer(game.progress, q, correct);
  const { goalJustMet } = countAnswer(game.rewards, today);
  if (correct) addTreats(game.rewards, TREATS_RIGHT);
  else { walk.hint = hintSteps(q); walk.hintUsed = true; }
  walk.lastKey = q.key;
  const row = {
    mode: 'walk', track: q.track, level: q.level, question: q.text, correct_answer: q.answer,
    given_answer: value, is_correct: correct, input_kind: q.mode, mistake_tag: tag,
    hint_used: !correct, seconds: Math.round((now - walk.startedAt) / 100) / 10,
  };
  return { correct, tag, event, goalJustMet, row };
}

export function finishHint(walk, game) {
  if (!walk.hint) return;
  addTreats(game.rewards, TREATS_HINT);
  walk.hint = null;
}

export function advance(walk) {
  walk.i += 1;
  if (walk.i >= walk.tracks.length) walk.done = true;
}
```

- [ ] **Step 4: Run** `npm test` — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add js/walk.js tests/walk.test.js
git commit -m "A walk as a state machine with double-tap protection"
```

---

### Task 8: Art — 15 friends, 20 items, 2 rooms

**Files:**
- Create: `assets/friends/<id>.webp` (15), `assets/items/<id>.webp` (20), `assets/rooms/<id>.webp` (2), `art/prompts.md`

**Interfaces:**
- Consumes: ids from `js/catalog.js` (Task 4).
- Produces: one file per catalog id, file name = id. Friends and items transparent, max 512 px on the long side; rooms 1600×1200.

- [ ] **Step 1: Write `art/prompts.md`** — one shared style line plus one line per asset.

Style line (prepended to every friend and item prompt):

```
Cute children's picture-book sticker, soft rounded shapes, thick soft dark-brown outline, warm pastel colours, gentle shading, big friendly eyes, full body, centred, facing the viewer, plain pure white background, no text, no shadow on the ground.
```

Friends (one line each), e.g.:

```
biscuit: a ginger smooth-haired dachshund puppy with a long body and floppy ears, wagging tail
pepper: a black-and-tan dachshund with a red collar, sitting
noodle: a dappled cream-and-brown dachshund, playful pose
mittens: a fluffy white kitten with pink nose and paws
ginger: an orange tabby kitten with stripes, curled tail
luna: a soft grey kitten with a little moon-shaped white patch on the forehead
gigi: a young giraffe with a pink bow on one ossicone
stretch: a tall giraffe with a very long neck, smiling
sunny: a tiny baby giraffe with big eyes, wobbly legs
kiki: a grey koala hugging a eucalyptus leaf
gumnut: a chubby koala with fluffy ears, waving
snooze: a sleepy koala with half-closed eyes and a tiny pillow
bandit: a raccoon with a striped tail and mask, cheeky grin
pip: a small young raccoon holding an acorn
rocky: a round raccoon wearing a tiny blue backpack
```

Items use the same style line with a short object description (e.g. `sofa: a comfy pastel-blue sofa with two cushions`). Rooms use a separate style line without the white-background clause: `Cosy children's picture-book illustration of an empty <living room with a wooden floor and a window | sunny garden with grass and a fence>, soft pastel colours, flat front view, lots of empty floor space, no animals, no text.`

- [ ] **Step 2: Generate.** Model `gpt_image_2_5`, aspect `1:1` for friends and items, `4:3` for rooms. Use `generate_image_batch` in groups of up to 12; wait with `jobs_wait`. Show Egor the 15 friends once (one `show_generation_by_ids`) before generating items, so a style he dislikes is caught after ~4 credits, not ~10.

- [ ] **Step 3: Remove backgrounds** for friends and items with `remove_background` (one call per image).

- [ ] **Step 4: Download and compress.** Save raw PNGs under `art-raw/` (git-ignored), then:

```bash
for f in art-raw/friends/*.png; do cwebp -quiet -q 82 -resize 512 0 -alpha_q 90 "$f" -o "assets/friends/$(basename "${f%.png}").webp"; done
for f in art-raw/items/*.png;   do cwebp -quiet -q 82 -resize 512 0 -alpha_q 90 "$f" -o "assets/items/$(basename "${f%.png}").webp"; done
for f in art-raw/rooms/*.png;   do cwebp -quiet -q 80 -resize 1600 0 "$f" -o "assets/rooms/$(basename "${f%.png}").webp"; done
```

- [ ] **Step 5: Check** every catalog id has a file:

```bash
node -e "import('./js/catalog.js').then(({FRIENDS,ITEMS,ROOMS})=>{const fs=require('fs');const miss=[...FRIENDS.map(f=>'assets/friends/'+f.id),...ITEMS.map(i=>'assets/items/'+i.id),...ROOMS.map(r=>'assets/rooms/'+r.id)].map(p=>p+'.webp').filter(p=>!fs.existsSync(p));console.log(miss.length?miss:'all present');process.exit(miss.length?1:0)})"
du -sh assets
```

Expected: `all present`, total under 4 MB.

- [ ] **Step 6: Commit**

```bash
git add art/prompts.md assets
git commit -m "Art: friends, items and rooms"
```

---

### Task 9: Screens — shell, start, hub, walk, keypad, sound

**Files:**
- Create: `index.html`, `styles.css`, `js/app.js`, `js/sound.js`, `js/ui/keypad.js`, `js/ui/start.js`, `js/ui/hub.js`, `js/ui/walkScreen.js`

**Interfaces:**
- Consumes: everything from Tasks 2–8.
- Produces:
  - `app.js` exports nothing; owns `game` (from `loadGame()`), `reporter`, and `go(screen, params?)`. After every state change it calls `saveGame(game)`. Screens receive `ctx = { game, reporter, sound, go, save }` and return a DOM element.
  - `sound.js`: `createSound(game) -> { right(), wrong(), chest(), levelUp(), tap(), toggle() }` — Web Audio oscillators, silent when `game.muted`.
  - `ui/keypad.js`: `keypad({ maxDigits = 3, onSubmit(value:number) }) -> HTMLElement` — digits 0–9, ⌫, a big ✓; shows typed number; ✓ disabled while empty.

**Screen behaviour (copy is final; British spelling):**

- **Start** (when `game.name === null`): "Hi! What's your name?" text field + big "That's me!" button (enabled when 1–20 letters). Then "Choose your first friend" with the 3 `STARTERS` as large cards; tap → `game.rewards.friends = [id]`, `game.activeFriend = id`, go hub.
- **Hub:** active friend large in the centre (idle bob animation); top bar: treats counter 🦴, streak 🔥 N, sound toggle. Daily goal ring "12 / 20 today". Buttons: "Go for a walk" (primary, largest), "Home", "Shop", "Zoomies ⚡". Tapping the friend cycles through owned friends.
- **Walk:** progress dots (10). Friend in a corner. Question in very large type ("59 + 25 = ?"). Choice mode: 4 big buttons in a 2×2 grid. Keypad mode: keypad component. On right: green flash, friend jumps, "+2 🦴", sound, next after 900 ms. On wrong: gentle shake, then the hint panel: friend says "Let's do it together!", each step shows `label` and `prompt = [ ]` with the keypad; a wrong step entry shakes and stays; a right one fills in green; after the last step "+1 🦴" and a "Next" button. `event === 'keypad_unlocked'` → toast "You're a star! Now type your answers ⌨️". `event === 'level_up'` → toast "New level unlocked! 🎉". `goalJustMet` → banner "Daily goal done! 🔥". After question 10 → chest screen: closed chest wobbles, tap to open, prize revealed with name ("You found Pepper the dachshund!" / "A Star lamp for your home!"); double chest if the daily goal was met during this walk. Then "Back home" → hub.
- Every `submit` result's `row` goes to `reporter.log(row)` followed by `reporter.flush()` (not awaited). Also `flush()` on app start, on `window.online`, every 30 s.

- [ ] **Step 1: Write `index.html`** — `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">`, theme colour, manifest link, `<main id="app"></main>`, `<script type="module" src="js/app.js">`. Font: Google Fonts "Baloo 2" (700, 800) with system rounded fallback.

- [ ] **Step 2: Write `styles.css`** — CSS variables for palette (cream background `#FFF7EC`, ink `#4A3426`, primary `#FF8A5B`, good `#3DBE8B`, soft `#FFD9A8`); every screen is `height: 100dvh; display: grid;` with no overflow; landscape uses two columns (friend | task), portrait stacks; `@media (orientation: portrait)` and `(orientation: landscape)`. Buttons min 64 px, font sizes in `clamp()`. Animations: `bob`, `jump`, `shake`, `pop`, respecting `prefers-reduced-motion`.

- [ ] **Step 3: Write `sound.js`, `ui/keypad.js`, `ui/start.js`, `ui/hub.js`, `ui/walkScreen.js`, `app.js`** to the behaviour above, using only the module interfaces from Tasks 2–7.

- [ ] **Step 4: Serve locally and play a full walk.** Add `.claude/launch.json` with `python3 -m http.server 5173`; open with `preview_start`. Play: first run → name → friend → walk with one wrong answer (hint flow) → chest → hub. Check the browser console has no errors.

- [ ] **Step 5: Check the outbox reached Supabase.** After the walk, `select count(*), bool_or(not is_correct) from maths_pets.answers where answered_at > now() - interval '10 minutes'` — expected 10 rows and at least one wrong. Delete these test rows afterwards.

- [ ] **Step 6: Viewport check (Review Focus 1).** With `resize_window` at 800×1280 and 1280×800 run in the page:

```js
[document.documentElement.scrollHeight <= innerHeight, document.documentElement.scrollWidth <= innerWidth]
```

on start, hub, walk (choice), walk (keypad), hint, chest. Expected `[true, true]` on every one, both orientations. Take one screenshot per orientation of the walk screen.

- [ ] **Step 7: Commit**

```bash
git add index.html styles.css js/app.js js/sound.js js/ui/keypad.js js/ui/start.js js/ui/hub.js js/ui/walkScreen.js .claude/launch.json
git commit -m "Start, hub and walk screens"
```

---

### Task 10: Screens — home, shop, Zoomies

**Files:**
- Create: `js/ui/home.js`, `js/ui/shop.js`, `js/ui/zoomies.js`
- Modify: `js/app.js` (register screens), `styles.css`

**Interfaces:**
- Consumes: `ROOMS`, `ITEMS`, `FRIENDS` (Task 4), `buy`, `addTreats` (Task 4), `makeTimes` (Task 2), `keypad` (Task 9), `reporter` (Task 6).

**Behaviour:**

- **Home:** room background; tabs "Living room" / "Garden". "My things" tray at the bottom shows owned items of that room not yet placed; tap an item → it appears in the middle of the room; drag (pointer events) to move; positions stored as fractions of the room box in `game.rewards.placed[room]` (`{id, x, y}` with 0..1). Long-press on a placed item → back to the tray. Owned friends walk slowly between random points of the room (CSS transitions every 3–6 s) and hop when tapped.
- **Shop:** two tabs "Things" and "Friends". Cards: picture, name, price 🦴. Owned → "Got it ✓" greyed. Not enough treats → price in grey and a tap says "Save up a little more!". Buying → pop animation, sound, and for a thing "Find it in your Home!".
- **Zoomies:** "Ready? 3, 2, 1, Go!" then 60-second bar. Times questions from groups `0..game.progress.times.level`, keypad only, next question immediately after each answer (right: green flash; wrong: correct answer shown for 700 ms). At the end: "You got N right!" and "New record! +10 🦴" when `N > game.rewards.zoomiesBest`. Each answer logged with `mode: 'zoomies'`, `input_kind: 'keypad'`, `hint_used: false`. Zoomies answers do **not** call `recordAnswer` or `countAnswer`.

- [ ] **Step 1: Write `ui/home.js`, `ui/shop.js`, `ui/zoomies.js`** and register them in `app.js`.

- [ ] **Step 2: Play through in the preview:** buy a thing with seeded treats (set `game.rewards.treats = 200` from the console on the local server only), place it, drag it, reload — it stays where it was. Run Zoomies to the end; check the record is saved and rows arrive with `mode = 'zoomies'`. Delete test rows.

- [ ] **Step 3: Viewport check** (same snippet as Task 9 Step 6) on home, shop and Zoomies, both orientations.

- [ ] **Step 4: Commit**

```bash
git add js/ui/home.js js/ui/shop.js js/ui/zoomies.js js/app.js styles.css
git commit -m "Home, shop and Zoomies"
```

---

### Task 11: Install and offline — manifest and service worker

**Files:**
- Create: `manifest.webmanifest`, `sw.js`, `assets/icon-192.png`, `assets/icon-512.png`
- Modify: `js/app.js` (register the service worker)

- [ ] **Step 1: `manifest.webmanifest`** — `name: "Maths Pets"`, `short_name: "Maths Pets"`, `start_url: "./"`, `scope: "./"`, `display: "fullscreen"`, `orientation: "any"`, `background_color: "#FFF7EC"`, `theme_color: "#FF8A5B"`, icons 192 and 512 (made from the Biscuit picture on a cream circle with `sips`).

- [ ] **Step 2: `sw.js`** — `const VERSION = 'v1'`; on install cache every app file and every asset (list generated from the catalog at write time and written literally into `sw.js`); on fetch: same-origin GET → cache first, falling back to network; requests to `supabase.co` are never cached; on activate delete caches whose name is not `maths-pets-${VERSION}`.

- [ ] **Step 3: Register** in `app.js`: `if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js')`.

- [ ] **Step 4: Offline check.** In the preview: load once, then in DevTools-equivalent `javascript_tool` confirm `await caches.keys()` contains `maths-pets-v1` and every asset URL is cached (`(await (await caches.open('maths-pets-v1')).keys()).length` equals the list length). Stop the local server, reload — the game still opens and a walk can be played; the outbox count grows; restart the server, reload — the outbox empties (Review Focus 2 end-to-end).

- [ ] **Step 5: Commit**

```bash
git add manifest.webmanifest sw.js assets/icon-192.png assets/icon-512.png js/app.js
git commit -m "Installable and playable offline"
```

---

### Task 12: Publish on GitHub Pages

- [ ] **Step 1:** `gh repo create muratovegorCompanion/maths-pets --public --source . --push`
- [ ] **Step 2:** Enable Pages from `main` / root: `gh api -X POST repos/muratovegorCompanion/maths-pets/pages -f "source[branch]=main" -f "source[path]=/"`
- [ ] **Step 3:** Wait for the first deploy by checking `gh api repos/muratovegorCompanion/maths-pets/pages/builds/latest --jq .status` once a minute until `built` (at most 10 checks), then open `https://muratovegorcompanion.github.io/maths-pets/` in the browser pane, play one question, confirm the row lands in Supabase, delete it.

---

### Task 13: Daily report at 20:00

**Files:**
- Create: `report/report.sql`, `report/prompt.md`

- [ ] **Step 1: Write `report/report.sql`** — the queries the report runs, all for the local day `(now() at time zone 'Asia/Bangkok')::date`, grouping `answered_at at time zone 'Asia/Bangkok'`:

```sql
-- 1. Day summary (walk answers only count towards the goal)
select count(*) filter (where mode = 'walk') as walk_answers,
       count(*) filter (where mode = 'zoomies') as zoomies_answers,
       round(sum(seconds) / 60.0, 1) as minutes,
       round(100.0 * avg(is_correct::int) filter (where mode = 'walk'), 0) as walk_accuracy_pct,
       count(distinct device_id) as devices
from maths_pets.answers
where (answered_at at time zone 'Asia/Bangkok')::date = :day;

-- 2. Per track: highest level seen today, accuracy at that level, input kind
select track, max(level) as level,
       count(*) filter (where level = (select max(level) from maths_pets.answers a2 where a2.track = a.track and (a2.answered_at at time zone 'Asia/Bangkok')::date = :day)) as n_at_level,
       count(*) filter (where is_correct and level = (select max(level) from maths_pets.answers a2 where a2.track = a.track and (a2.answered_at at time zone 'Asia/Bangkok')::date = :day)) as right_at_level,
       mode() within group (order by input_kind) as input_kind
from maths_pets.answers a
where mode = 'walk' and (answered_at at time zone 'Asia/Bangkok')::date = :day
group by track;

-- 3. Mistakes by tag with an example
select track, mistake_tag, count(*) as n, min(question || ' → ' || given_answer) as example
from maths_pets.answers
where not is_correct and (answered_at at time zone 'Asia/Bangkok')::date = :day
group by track, mistake_tag order by n desc;

-- 4. Times facts answered wrong today
select question, correct_answer, given_answer
from maths_pets.answers
where track = 'times' and not is_correct and (answered_at at time zone 'Asia/Bangkok')::date = :day;

-- 5. Days with 20+ walk answers, last 30 days (streak)
select (answered_at at time zone 'Asia/Bangkok')::date as day, count(*) filter (where mode = 'walk') as n
from maths_pets.answers
where answered_at > now() - interval '30 days'
group by 1 order by 1 desc;
```

- [ ] **Step 2: Write `report/prompt.md`** — the scheduled task's instructions, in Russian output:

```
Ты пишешь Егору короткий вечерний отчёт о том, как дочка занималась в игре Maths Pets сегодня.

1. Выполни запросы из ~/Projects/maths-pets/report/report.sql через Supabase execute_sql,
   проект bsywzzzzizfvmuerqlqr, подставив вместо :day сегодняшнюю дату по Бангкоку ('YYYY-MM-DD').
2. Если сегодня 0 ответов — одна строка: «Сегодня Maths Pets не открывали.» и всё.
3. Иначе 4–7 строк, тепло и просто, без терминов:
   - сколько примеров и минут, выполнена ли цель 20, серия дней (из запроса 5: дни подряд до сегодня с n ≥ 20;
     один пропущенный день в неделю прощается, если серия была 3+);
   - сложение: ступенька (1: 30+40, 2: 42+5, 3: 47+8, 4: 32+25, 5: 59+25, 6: 78+46), сколько верно на ней,
     выбирает из вариантов или уже набирает сама;
   - умножение: группа (0: ×2 ×5 ×10, 1: ×3 ×4 ×8, 2: ×6 ×7 ×9 ×11 ×12), какие факты путает (запрос 4);
   - главная ошибка дня с примером: forgot_carry = «забывает перенести десяток»,
     side_by_side = «пишет десятки и единицы рядом (714 вместо 84)», extra_ten = «добавляет лишний десяток»,
     off_by_one/off_by_ten = «ошибается на единицу/десяток», neighbour_fact = «путает с соседним фактом»,
     added_instead = «складывает вместо умножения»;
   - один совет на завтра, вытекающий из главной ошибки.
4. Каждая цифра — только из результатов запросов. Если ответов меньше 5 — так и скажи, выводов не делай.
5. Если devices > 1 — добавь строку, что играли с нескольких устройств.
```

- [ ] **Step 3: Create the scheduled task** with the `scheduled-tasks` tool: name "Maths Pets — вечерний отчёт", cron `0 20 * * *` (Mac local time, UTC+7), prompt = the contents of `report/prompt.md`.

- [ ] **Step 4: Prove it** — insert 6 synthetic rows for today with a fixed test `device_id` `00000000-0000-4000-8000-000000000000` via `execute_sql` (two `forgot_carry` mistakes on level 5, one `neighbour_fact` on 4×8), run the scheduled task once now (`run_scheduled_task`), check the report names "забывает перенести десяток" and 4×8 and does not invent anything else; then delete the synthetic rows.

- [ ] **Step 5: Commit**

```bash
git add report/report.sql report/prompt.md
git commit -m "Daily report queries and prompt"
git push
```

---

## Self-review notes

- Spec coverage: walk 6+4 (T7), treats (T4/T7), chest + friend guarantee (T4), home (T10), shop (T10), daily goal + streak with freeze (T4), Zoomies (T10), addition steps 1–6 (T2), times groups (T2), choice→keypad→next (T3), retry queue (T3), typical-mistake choices (T2), hint steps (T2/T9), report (T13), offline + outbox (T6/T11), name stays local (T6 test), Supabase project choice + security check (T6), art (T8), sound + mute (T9), first-run name (T9), publish (T12).
- Spec drift fixed here: one attempt per question, so "first try without hint" equals "correct"; treats are +2 for right and +1 after a finished hint. Same total as the spec's "+1, +1 more on first try".
