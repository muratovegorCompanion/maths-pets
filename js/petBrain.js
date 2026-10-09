// js/petBrain.js — what a friend in the house does next. Pure: positions are fractions of the room,
// times are milliseconds, randomness comes in as rand(). The screen (ui/pets.js) only draws it.

// What a friend does with each thing.
export const ACTIVITY = {
  dogbed: 'sleep', kennel: 'sleep', cushions: 'sleep', sofa: 'sleep',
  pond: 'splash', trampoline: 'bounce', swing: 'swing',
  treehouse: 'climb', tree: 'climb', cattower: 'climb',
  piano: 'music', fishtank: 'watch', picnic: 'eat',
  flowers: 'sniff', mushrooms: 'sniff',
  rug: 'rest', bench: 'rest', bookshelf: 'rest', lamp: 'rest', plant: 'rest',
};

const DURATION = { splash: 7000, bounce: 6000, swing: 8000, climb: 8000, music: 6000, watch: 8000, eat: 6000, sniff: 4000, rest: 7000 };
export const SLEEP_MS = 45000;
const OWN_NAP_MS = 10000;     // when a friend goes to bed by itself
const OWN_PLAY_SHARE = 0.6;   // and uses things by itself a little shorter than when she puts it there
export const FLOOR = { x0: 0.08, x1: 0.92, y0: 0.5, y1: 0.84 };
export const MIN_STEP = 0.25;
const SPEED = 0.12;          // room widths per second, strolling
const RUN = 0.32;            // after a tap, or after the ball
const GO_TO_THING = 0.25;    // chance that the next stroll is to a thing
const HOME = { x: 0.5, y: 0.75 };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const floorSpot = rand => ({ x: FLOOR.x0 + rand() * (FLOOR.x1 - FLOOR.x0), y: FLOOR.y0 + rand() * (FLOOR.y1 - FLOOR.y0) });

function farSpot(p, rand) {
  let best = null;
  for (let i = 0; i < 12; i++) {
    const s = floorSpot(rand);
    if (dist(p, s) >= MIN_STEP) return s;
    if (!best || dist(p, s) > dist(p, best)) best = s;
  }
  // nothing far enough came up: go to the opposite side of the room
  return { x: p.x < 0.5 ? FLOOR.x1 : FLOOR.x0, y: best.y };
}

// Where the friend stands while using a thing.
export function activitySpot(activity, item) {
  if (activity === 'climb') return { x: item.x, y: item.y - 0.18 };
  if (activity === 'sleep') return { x: item.x, y: item.y - 0.04 };
  if (['splash', 'bounce', 'swing'].includes(activity)) return { x: item.x, y: item.y - 0.03 };
  return { x: item.x > 0.8 ? item.x - 0.1 : item.x + 0.1, y: clamp(item.y + 0.02, FLOOR.y0, FLOOR.y1) };
}

function walkTo(p, target, now, { fast = false, goal = null, goalItem = null, carrying = p.carrying ?? null } = {}) {
  const ms = Math.max(600, (dist(p, target) / (fast ? RUN : SPEED)) * 1000);
  return { ...p, mode: 'walk', target, until: now + ms, fast, goal, goalItem, carrying,
    facing: target.x < p.x ? -1 : 1, activity: null, reaction: null };
}

export function newPet(id, now, rand) {
  return { id, ...floorSpot(rand), mode: 'idle', until: now + 500 + rand() * 1500, facing: 1,
    activity: null, reaction: null, goal: null, goalItem: null, carrying: null, fast: false, target: null };
}

// The current state ran out: choose what comes next.
export function next(p, items, now, rand) {
  if (p.mode === 'activity' && p.activity === 'sleep') return { ...p, mode: 'react', reaction: 'stretch', until: now + 1500, activity: null };
  if (p.mode === 'react' && p.reaction === 'happy') return walkTo(p, farSpot(p, rand), now, { fast: true });
  if (items.length && rand() < GO_TO_THING) {
    const it = items[Math.floor(rand() * items.length)];
    return walkTo(p, activitySpot(ACTIVITY[it.id], it), now, { goal: it.id, goalItem: it });
  }
  return walkTo(p, farSpot(p, rand), now);
}

// A walk finished.
export function arrive(p, now, rand) {
  const here = { ...p, ...(p.target ?? {}), target: null, fast: false };
  if (p.goal === 'ball' && !p.carrying) return walkTo(here, HOME, now, { fast: true, carrying: 'ball' });
  if (p.carrying === 'ball') return { ...here, carrying: null, goal: null, mode: 'react', reaction: 'happy', until: now + 1200 };
  if (p.goalItem) return dropOn(here, p.goalItem, now, null, { own: true });
  return { ...here, goal: null, mode: 'idle', until: now + 1000 + rand() * 2500 };
}

// Put down by her finger: on a thing, or on the floor at `at`.
// Things nobody else is using or heading to.
export function freeItems(items, pets, selfId) {
  return items.filter(i => !pets.some(q => q.id !== selfId &&
    ((q.mode === 'activity' && q.item === i.id) || q.goal === i.id)));
}

export function dropOn(p, item, now, at = null, { own = false, occupied = false } = {}) {
  const base = { ...p, goal: null, goalItem: null, target: null, fast: false, reaction: null, carrying: null };
  if (!item) return { ...base, ...(at ?? {}), mode: 'idle', activity: null, until: now + 1500 };
  const activity = ACTIVITY[item.id] ?? 'rest';
  const spot = activitySpot(activity, item);
  if (occupied) spot.x = spot.x > 0.8 ? spot.x - 0.09 : spot.x + 0.09;   // beside whoever is already there
  return { ...base, ...spot, mode: 'activity', activity, item: item.id,
    until: now + (activity === 'sleep' ? (own ? OWN_NAP_MS : SLEEP_MS) : Math.round(DURATION[activity] * (own ? OWN_PLAY_SHARE : 1))) };
}

export function tap(p, now) {
  if (p.mode === 'activity' && p.activity === 'sleep') return { ...p, mode: 'react', reaction: 'stretch', activity: null, until: now + 1500 };
  return { ...p, mode: 'react', reaction: 'happy', activity: null, goal: null, goalItem: null, target: null, until: now + 900 };
}

export function feed(p, rewards, now) {
  if (rewards.treats < 1) return { ok: false, pet: p };
  rewards.treats -= 1;
  return { ok: true, pet: { ...p, mode: 'react', reaction: 'eat', activity: null, goal: null, goalItem: null, target: null, until: now + 2000 } };
}

const asleep = p => p.mode === 'activity' && p.activity === 'sleep';

export function chaseBall(pets, ball, now) {
  const awake = pets.filter(p => !asleep(p) && p.mode !== 'carried');
  if (!awake.length) return { pets, chaser: null };
  const chaser = awake.reduce((a, b) => (dist(b, ball) < dist(a, ball) ? b : a));
  return {
    chaser: chaser.id,
    pets: pets.map(p => (p.id === chaser.id ? walkTo(p, { x: ball.x, y: ball.y }, now, { fast: true, goal: 'ball' }) : p)),
  };
}
