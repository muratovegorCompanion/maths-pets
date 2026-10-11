// js/ui/hub.js — the main screen: her friend, today's goal, and where to go next.
import { h, friendSrc, topBar, today, bump } from './dom.js';
import { FRIENDS } from '../catalog.js';
import { DAILY_GOAL } from '../rewards.js';

function goalRing(done) {
  const r = 52, c = 2 * Math.PI * r, part = Math.min(done, DAILY_GOAL) / DAILY_GOAL;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('class', 'ring');
  svg.innerHTML = `
    <circle cx="60" cy="60" r="${r}" class="ring-track"/>
    <circle cx="60" cy="60" r="${r}" class="ring-fill" stroke-dasharray="${c * part} ${c}" transform="rotate(-90 60 60)"/>
    <text x="60" y="58" text-anchor="middle" class="ring-num">${Math.min(done, DAILY_GOAL)}/${DAILY_GOAL}</text>
    <text x="60" y="80" text-anchor="middle" class="ring-label">${done >= DAILY_GOAL ? 'done! 🔥' : 'today'}</text>`;
  return svg;
}

export function hubScreen(ctx) {
  const { game, sound, go, save } = ctx;
  const r = game.rewards;
  if (!game.activeFriend || !r.friends.includes(game.activeFriend)) game.activeFriend = r.friends[0];
  const doneToday = r.daily.date === today() ? r.daily.count : 0;

  const img = h('img', { class: 'hub-pet bob', src: friendSrc(game.activeFriend), alt: '' });
  const name = h('div', { class: 'pet-name' });
  const showName = () => { name.textContent = FRIENDS.find(f => f.id === game.activeFriend)?.name ?? ''; };
  showName();
  const pet = h('button', { class: 'hub-pet-btn', 'aria-label': 'Next friend', onclick: () => {
    const i = r.friends.indexOf(game.activeFriend);
    game.activeFriend = r.friends[(i + 1) % r.friends.length];
    img.src = friendSrc(game.activeFriend);
    showName();
    sound.friend(game.activeFriend);
    bump(img, 'jump');
    save();
  } }, img);

  return h('section', { class: 'screen hub' },
    topBar(ctx),
    h('div', { class: 'hub-body' },
      h('div', { class: 'hub-left' },
        h('h1', { class: 'hello' }, `Hi, ${game.name}!`),
        pet, name),
      h('div', { class: 'hub-right' },
        goalRing(doneToday),
        h('button', { class: 'btn primary big', onclick: () => { sound.tap(); go('walk'); } }, '🐾 Go for a walk'),
        h('div', { class: 'hub-row' },
          h('button', { class: 'btn', onclick: () => { sound.tap(); go('home'); } }, '🏠 Home'),
          h('button', { class: 'btn', onclick: () => { sound.tap(); go('shop'); } }, '🛍️ Shop')),
        h('button', { class: 'btn zoom', onclick: () => { sound.tap(); go('zoomies'); } }, '⚡ Zoomies'))));
}
