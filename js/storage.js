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
