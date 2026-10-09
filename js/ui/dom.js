// js/ui/dom.js — small helpers every screen uses.
import { currentStreak, localDate } from '../rewards.js';

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

export const friendSrc = id => `assets/friends/${id}.webp`;
export const itemSrc = id => `assets/items/${id}.webp`;
export const roomSrc = id => `assets/rooms/${id}.webp`;
export const today = () => localDate(new Date());

export function toast(text, ms = 2000) {
  const t = h('div', { class: 'toast', role: 'status' }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

// Restart a CSS animation class on an element.
export function bump(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

export function topBar(ctx, { back = null } = {}) {
  const { game, sound } = ctx;
  const treats = h('div', { class: 'pill', 'aria-label': 'Treats' });
  const streak = h('div', { class: 'pill', 'aria-label': 'Days in a row' });
  const mute = h('button', { class: 'icon-btn', 'aria-label': 'Sound on or off' });
  mute.addEventListener('click', () => { sound.toggle(); ctx.save(); update(); });
  function update() {
    treats.textContent = `🦴 ${game.rewards.treats}`;
    streak.textContent = `🔥 ${currentStreak(game.rewards, today())}`;
    mute.textContent = game.muted ? '🔇' : '🔊';
  }
  update();
  const bar = h('header', { class: 'topbar' },
    back ? h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: back }, '←') : null,
    h('div', { class: 'spacer' }), treats, streak, mute);
  bar.update = update;
  return bar;
}
