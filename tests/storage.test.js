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
