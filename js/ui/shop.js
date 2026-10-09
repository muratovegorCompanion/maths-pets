// js/ui/shop.js — spend treats on things for the house and new friends.
import { h, friendSrc, itemSrc, topBar, toast, bump } from './dom.js';
import { FRIENDS, ITEMS } from '../catalog.js';
import { buy } from '../rewards.js';

export function shopScreen(ctx) {
  const { game, sound, go, save } = ctx;
  const r = game.rewards;
  let tab = 'item';

  const bar = topBar(ctx, { back: () => go('hub') });
  const tabs = h('div', { class: 'tabs' });
  const grid = h('div', { class: 'shop-grid' });

  function card(type, thing) {
    const owned = (type === 'friend' ? r.friends : r.items).includes(thing.id);
    const affordable = r.treats >= thing.price;
    const el = h('button', { class: `shop-card${owned ? ' owned' : ''}${!owned && !affordable ? ' short' : ''}` },
      h('img', { src: type === 'friend' ? friendSrc(thing.id) : itemSrc(thing.id), alt: '' }),
      h('span', { class: 'shop-name' }, thing.name),
      h('span', { class: 'price' }, owned ? 'Got it ✓' : `🦴 ${thing.price}`));
    el.addEventListener('click', () => {
      if (owned) return;
      const res = buy(r, type, thing.id);
      if (!res.ok) { sound.wrong(); bump(el, 'shake'); toast('Save up a little more! 🦴'); return; }
      save();
      sound.chest();
      bar.update();
      toast(type === 'friend' ? `${thing.name} joined your family! 🎉` : 'Find it in your Home! 🏠');
      draw();
    });
    return el;
  }

  function draw() {
    tabs.replaceChildren(
      h('button', { class: `tab${tab === 'item' ? ' on' : ''}`, onclick: () => { tab = 'item'; sound.tap(); draw(); } }, 'Things'),
      h('button', { class: `tab${tab === 'friend' ? ' on' : ''}`, onclick: () => { tab = 'friend'; sound.tap(); draw(); } }, 'Friends'));
    const list = tab === 'friend' ? FRIENDS : ITEMS;
    grid.replaceChildren(...list.map(t => card(tab, t)));
  }

  draw();
  return h('section', { class: 'screen shop' }, bar, h('div', { class: 'shop-body' }, tabs, grid));
}
