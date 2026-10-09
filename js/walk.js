// js/walk.js — one walk of 10 questions: what is on screen, what happens on each tap.
import { nextQuestion, recordAnswer } from './progress.js';
import { makeChoices, hintSteps, classifyMistake } from './maths.js';
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
  const tag = correct ? null : (walk.choices?.find(c => c.value === value)?.tag ?? classifyMistake(q, value));
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
