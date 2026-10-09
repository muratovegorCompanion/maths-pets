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

// The streak to show today: it stays alive through yesterday, or through a gap the weekly freeze can still cover.
export function currentStreak(r, today) {
  const s = r.streak;
  if (!s.lastDate) return 0;
  const gap = daysBetween(s.lastDate, today);
  if (gap <= 1) return s.count;
  if (gap === 2 && s.count >= 3 && s.freezeWeek !== isoWeek(today)) return s.count;
  return 0;
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
