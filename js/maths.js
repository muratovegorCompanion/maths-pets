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
