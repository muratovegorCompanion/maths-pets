// js/ui/walkScreen.js — a walk: 10 questions with her friend, hints on mistakes, a chest at the end.
import { h, friendSrc, itemSrc, topBar, toast, today, bump } from './dom.js';
import { keypad } from './keypad.js';
import { startWalk, showNext, submit, finishHint, advance } from '../walk.js';
import { openChest, TREATS_RIGHT, TREATS_HINT } from '../rewards.js';
import { FRIENDS, ITEMS } from '../catalog.js';

const CHEER = ['Yay!', 'Brilliant!', 'Paw-some!', 'Super!', 'You did it!', 'Amazing!'];
const SPECIES = { dachshund: 'dachshund', cat: 'kitten', giraffe: 'giraffe', koala: 'koala', raccoon: 'raccoon' };
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

export function walkScreen(ctx) {
  const { game, reporter, sound, go, save } = ctx;
  const walk = startWalk();
  let right = 0, goalMet = false;

  const bar = topBar(ctx, { back: () => go('hub') });
  const dots = h('div', { class: 'dots' }, ...walk.tracks.map(() => h('span', { class: 'dot' })));
  const friend = h('img', { class: 'walk-pet bob', src: friendSrc(game.activeFriend), alt: '' });
  const bubble = h('div', { class: 'bubble' }, "Let's go!");
  const question = h('div', { class: 'question' });
  const answerArea = h('div', { class: 'answer-area' });
  const floaty = h('div', { class: 'floaty' });

  const body = h('div', { class: 'walk-body' },
    h('div', { class: 'walk-left' }, bubble, friend, floaty),
    h('div', { class: 'walk-right' }, question, answerArea));
  const screen = h('section', { class: 'screen walk' }, bar, dots, body);

  function say(text) { bubble.textContent = text; bump(bubble, 'pop'); }
  function plus(n) { floaty.textContent = `+${n} 🦴`; bump(floaty, 'float-up'); }

  function setQuestion(slotText) {
    question.replaceChildren(
      h('span', {}, `${walk.q.text} = `),
      h('span', { class: 'slot' }, slotText));
  }

  function ask() {
    showNext(walk, game, performance.now());
    dots.children[walk.i].classList.add('now');
    setQuestion('?');
    if (walk.q.mode === 'choice') {
      const buttons = walk.choices.map(c => h('button', { class: 'btn choice', onclick: e => answer(c.value, e.currentTarget) }, String(c.value)));
      answerArea.replaceChildren(h('div', { class: 'choices' }, ...buttons));
    } else {
      const slot = () => question.querySelector('.slot');
      answerArea.replaceChildren(keypad({
        sound,
        onChange: v => { const s = slot(); if (s) s.textContent = v || '?'; },
        onSubmit: v => answer(v, null),
      }));
    }
  }

  function answer(value, button) {
    const res = submit(walk, game, value, performance.now(), today());
    if (!res) return;
    reporter.log(res.row);
    reporter.flush();
    answerArea.querySelectorAll('button').forEach(b => { b.disabled = true; });
    const dot = dots.children[walk.i];
    dot.classList.remove('now');

    if (res.goalJustMet) { goalMet = true; toast('Daily goal done! 🔥 Double chest today!', 2600); sound.levelUp(); }
    if (res.event === 'keypad_unlocked') toast("You're a star! Now type your answers ⌨️", 2600);
    if (res.event === 'level_up') { toast('New level unlocked! 🎉', 2600); sound.levelUp(); }

    if (res.correct) {
      right += 1;
      dot.classList.add('right');
      button?.classList.add('right');
      question.querySelector('.slot').textContent = String(walk.q.answer);
      question.classList.add('good');
      sound.right();
      say(pick(CHEER));
      bump(friend, 'jump');
      plus(TREATS_RIGHT);
      bar.update();
      save();
      setTimeout(() => { question.classList.remove('good'); next(); }, 1000);
    } else {
      dot.classList.add('wrong');
      button?.classList.add('wrong');
      sound.wrong();
      bump(question, 'shake');
      say("Let's do it together!");
      save();
      setTimeout(showHint, 700);
    }
  }

  function showHint() {
    const steps = walk.hint;
    let at = 0;
    const rows = steps.map(s => {
      const slot = h('span', { class: 'slot small' }, '?');
      return { slot, el: h('div', { class: 'hint-row' }, h('div', { class: 'hint-label' }, s.label), h('div', { class: 'hint-sum' }, `${s.prompt} = `, slot)) };
    });
    const list = h('div', { class: 'hint' }, ...rows.map(r => r.el));
    const pad = keypad({
      sound,
      onChange: v => { if (rows[at]) rows[at].slot.textContent = v || '?'; },
      onSubmit: v => {
        const row = rows[at];
        if (v !== steps[at].answer) { sound.wrong(); bump(row.slot, 'shake'); row.slot.textContent = '?'; return; }
        row.slot.textContent = String(v);
        row.el.classList.remove('now'); row.el.classList.add('done');
        sound.right();
        at += 1;
        if (at < steps.length) { rows[at].el.classList.add('now'); return; }
        finishHint(walk, game);
        save();
        bar.update();
        plus(TREATS_HINT);
        say('You worked it out! 🌟');
        setQuestion(String(walk.q.answer));
        question.classList.add('good');
        answerArea.replaceChildren(list, h('button', { class: 'btn primary', onclick: () => { question.classList.remove('good'); next(); } }, 'Next →'));
      },
    });
    rows[0].el.classList.add('now');
    question.parentElement.classList.add('compact');
    answerArea.replaceChildren(list, pad);
  }

  function next() {
    question.parentElement.classList.remove('compact');
    advance(walk);
    if (walk.done) chest(); else ask();
  }

  function prizeView(p) {
    if (p.type === 'friend') {
      const f = FRIENDS.find(x => x.id === p.id);
      if (!game.activeFriend) game.activeFriend = f.id;
      return h('div', { class: 'prize pop' }, h('img', { src: friendSrc(f.id), alt: '' }), h('p', {}, `You found ${f.name} the ${SPECIES[f.species]}!`));
    }
    if (p.type === 'item') {
      const it = ITEMS.find(x => x.id === p.id);
      return h('div', { class: 'prize pop' }, h('img', { src: itemSrc(it.id), alt: '' }), h('p', {}, `A ${it.name} for your home!`));
    }
    return h('div', { class: 'prize pop' }, h('div', { class: 'prize-emoji' }, '🦴'), h('p', {}, `+${p.amount} treats!`));
  }

  function chest() {
    dots.remove();
    const box = h('button', { class: 'chest wobble', 'aria-label': 'Open the chest' }, goalMet ? '🎁🎁' : '🎁');
    const stage = h('div', { class: 'chest-stage' },
      h('h1', {}, 'Walk complete!'),
      h('p', { class: 'score' }, `You got ${right} of ${walk.tracks.length} right`),
      box,
      h('p', { class: 'tap-hint' }, 'Tap the chest!'));
    box.addEventListener('click', () => {
      const { prizes } = openChest(game.rewards, Math.random, { double: goalMet });
      save();
      sound.chest();
      bar.update();
      stage.replaceChildren(
        h('h1', {}, prizes.length > 1 ? 'Double surprise!' : 'Surprise!'),
        h('div', { class: 'prizes' }, ...prizes.map(prizeView)),
        h('div', { class: 'hub-row' },
          h('button', { class: 'btn', onclick: () => go('hub') }, 'Back home'),
          h('button', { class: 'btn primary', onclick: () => go('walk') }, 'Another walk 🐾')));
    }, { once: true });
    body.replaceChildren(stage);
  }

  ask();
  return screen;
}
