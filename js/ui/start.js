// js/ui/start.js — first run: her name, then her first friend.
import { h, friendSrc } from './dom.js';
import { FRIENDS, STARTERS } from '../catalog.js';

const NAME_OK = /^[\p{L}][\p{L} '-]{0,19}$/u;

export function startScreen(ctx) {
  const { game, sound, go, save } = ctx;
  const screen = h('section', { class: 'screen start' });

  function askName() {
    const input = h('input', { class: 'name-input', type: 'text', maxlength: '20', autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false', 'aria-label': 'Your name' });
    const btn = h('button', { class: 'btn primary', disabled: true }, "That's me!");
    input.addEventListener('input', () => { btn.disabled = !NAME_OK.test(input.value.trim()); });
    const submit = () => {
      const name = input.value.trim();
      if (!NAME_OK.test(name)) return;
      sound.tap();
      game.name = name;
      save();
      chooseFriend();
    };
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    screen.replaceChildren(h('div', { class: 'start-card' },
      h('img', { class: 'start-friend bob', src: friendSrc('biscuit'), alt: '' }),
      h('h1', {}, "Hi! What's your name?"),
      input, btn));
    setTimeout(() => input.focus(), 50);
  }

  function chooseFriend() {
    const cards = STARTERS.map(id => {
      const f = FRIENDS.find(x => x.id === id);
      return h('button', { class: 'friend-card', onclick: () => {
        sound.right();
        game.rewards.friends = [id];
        game.activeFriend = id;
        save();
        go('hub');
      } }, h('img', { src: friendSrc(id), alt: '' }), h('span', {}, f.name));
    });
    screen.replaceChildren(h('div', { class: 'start-card wide' },
      h('h1', {}, `Hello, ${game.name}! Choose your first friend`),
      h('div', { class: 'friend-row' }, ...cards)));
  }

  if (game.name) chooseFriend(); else askName();
  return screen;
}
