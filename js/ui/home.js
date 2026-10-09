// js/ui/home.js — the friends' house: place things, drag them around, watch friends wander.
import { h, friendSrc, itemSrc, roomSrc, topBar } from './dom.js';
import { ROOMS, ITEMS } from '../catalog.js';

const BIG = new Set(['rug', 'tree', 'treehouse', 'pond', 'trampoline', 'picnic', 'sofa', 'swing']);
// Rugs, blankets and ponds lie on the floor: always behind everything else.
const FLAT = new Set(['rug', 'picnic', 'pond']);
const clampX = v => Math.min(0.94, Math.max(0.06, v));
// Keep things below the top buttons and above the tray.
const clampY = v => Math.min(0.86, Math.max(0.3, v));

export function homeScreen(ctx, { room: startRoom = 'living' } = {}) {
  const { game, sound, go, save } = ctx;
  const r = game.rewards;
  let roomId = startRoom;

  const roomEl = h('div', { class: 'room' });
  const tray = h('div', { class: 'tray' });
  const tabs = h('div', { class: 'tabs' });
  // The room fills the whole screen; the buttons and the tray float over it.
  const screen = h('section', { class: 'screen home' },
    roomEl,
    h('div', { class: 'home-top' }, topBar(ctx, { back: () => go('hub') }), tabs),
    tray);

  function placed() { return r.placed[roomId] ?? (r.placed[roomId] = []); }

  function drawTabs() {
    tabs.replaceChildren(...ROOMS.map(rm => h('button', {
      class: `tab${rm.id === roomId ? ' on' : ''}`,
      onclick: () => { roomId = rm.id; sound.tap(); draw(); },
    }, rm.name)));
  }

  function setPos(el, x, y, flat = false) {
    el.style.left = `${x * 100}%`;
    el.style.top = `${y * 100}%`;
    el.style.zIndex = String(flat ? 1 : 10 + Math.round(y * 100));
  }

  function placedItem(p) {
    const el = h('img', { class: `thing${BIG.has(p.id) ? ' big' : ''}`, src: itemSrc(p.id), alt: '', draggable: 'false' });
    setPos(el, p.x, p.y, FLAT.has(p.id));
    let start = null, moved = false, outside = false;
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      start = { x: e.clientX, y: e.clientY };
      moved = false;
      el.classList.add('lifted');
    });
    el.addEventListener('pointermove', e => {
      if (!start) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) moved = true;
      if (!moved) return;
      const box = roomEl.getBoundingClientRect();
      const rx = (e.clientX - box.left) / box.width, ry = (e.clientY - box.top) / box.height;
      outside = e.clientY > tray.getBoundingClientRect().top;
      el.classList.toggle('leaving', outside);
      p.x = clampX(rx);
      p.y = clampY(ry);
      setPos(el, p.x, p.y, FLAT.has(p.id));
    });
    const end = () => {
      if (start && outside) {
        const list = placed();
        list.splice(list.indexOf(p), 1);
        sound.tap();
        save();
        draw();
        return;
      }
      if (start && moved) save();
      start = null;
      el.classList.remove('lifted', 'leaving');
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    return el;
  }

  function friendEl(id) {
    const el = h('img', { class: 'roamer', src: friendSrc(id), alt: '' });
    const move = () => setPos(el, 0.12 + Math.random() * 0.76, 0.5 + Math.random() * 0.32);
    move();
    el.addEventListener('click', () => { sound.tap(); el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop'); });
    el.wander = move;
    return el;
  }

  function draw() {
    drawTabs();
    roomEl.style.backgroundImage = `url(${roomSrc(roomId)})`;
    const friends = r.friends.map(friendEl);
    roomEl.replaceChildren(...placed().map(placedItem), ...friends);
    const here = new Set(placed().map(p => p.id));
    const mine = ITEMS.filter(i => i.room === roomId && r.items.includes(i.id) && !here.has(i.id));
    tray.replaceChildren(
      h('div', { class: 'tray-title' }, mine.length ? 'Tap to put in the room · drag down here to put away' : 'Drag things down here to put them away'),
      h('div', { class: 'tray-items' }, ...mine.map(i => h('button', {
        class: 'tray-item', 'aria-label': i.name,
        onclick: () => { placed().push({ id: i.id, x: 0.25 + Math.random() * 0.5, y: 0.5 + Math.random() * 0.3 }); sound.right(); save(); draw(); },
      }, h('img', { src: itemSrc(i.id), alt: '' })))));
  }

  const timer = setInterval(() => {
    if (!screen.isConnected) { clearInterval(timer); return; }
    for (const el of roomEl.querySelectorAll('.roamer')) if (Math.random() < 0.5) el.wander();
  }, 3000);

  draw();
  return screen;
}
