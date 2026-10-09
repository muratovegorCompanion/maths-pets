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
