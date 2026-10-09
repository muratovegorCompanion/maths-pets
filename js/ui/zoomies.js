// js/ui/zoomies.js — 60 seconds of times tables against her own record.
import { h, friendSrc, topBar, toast } from './dom.js';
import { keypad } from './keypad.js';
import { makeTimes, classifyMistake } from '../maths.js';
import { addTreats } from '../rewards.js';

const SECONDS = 60;
const RECORD_BONUS = 10;

export function zoomiesScreen(ctx) {
  const { game, reporter, sound, go, save } = ctx;
  const bar = topBar(ctx, { back: () => go('hub') });
  const body = h('div', { class: 'zoom-body' });
  const screen = h('section', { class: 'screen zoomies' }, bar, body);

  function intro() {
    body.replaceChildren(h('div', { class: 'zoom-intro' },
      h('img', { class: 'walk-pet bob', src: friendSrc(game.activeFriend), alt: '' }),
      h('h1', {}, 'Zoomies! ⚡'),
      h('p', { class: 'score' }, `How many times tables can you do in ${SECONDS} seconds?`),
      game.rewards.zoomiesBest ? h('p', { class: 'score' }, `Your record: ${game.rewards.zoomiesBest}`) : null,
      h('button', { class: 'btn zoom big', onclick: countdown }, 'Ready!')));
  }

  function countdown() {
    let n = 3;
    const big = h('div', { class: 'countdown pop' }, '3');
    body.replaceChildren(big);
    sound.tap();
    const t = setInterval(() => {
      n -= 1;
      if (!screen.isConnected) { clearInterval(t); return; }
      if (n === 0) { big.textContent = 'Go!'; sound.right(); }
      else if (n < 0) { clearInterval(t); play(); return; }
      else { big.textContent = String(n); sound.tap(); }
      big.classList.remove('pop'); void big.offsetWidth; big.classList.add('pop');
    }, 800);
  }

  function play() {
    let right = 0, q = null, shownAt = 0, over = false, lastKey = null;
    const t0 = performance.now();
    const fill = h('div', { class: 'time-fill' });
    const count = h('div', { class: 'pill' }, '✓ 0');
    const question = h('div', { class: 'question' });
    const slot = () => question.querySelector('.slot');
    const pad = keypad({
      sound,
      onChange: v => { const s = slot(); if (s) s.textContent = v || '?'; },
      onSubmit: v => answer(v),
    });

    function ask() {
      do q = makeTimes(Math.floor(Math.random() * (game.progress.times.level + 1)));
      while (q.key === lastKey);
      lastKey = q.key;
      shownAt = performance.now();
      question.classList.remove('good', 'bad');
      question.replaceChildren(h('span', {}, `${q.text} = `), h('span', { class: 'slot' }, '?'));
    }

    function answer(v) {
      if (over) return;
      const correct = v === q.answer;
      reporter.log({
        mode: 'zoomies', track: 'times', level: q.level, question: q.text, correct_answer: q.answer,
        given_answer: v, is_correct: correct, input_kind: 'keypad', mistake_tag: correct ? null : classifyMistake(q, v),
        hint_used: false, seconds: Math.round((performance.now() - shownAt) / 100) / 10,
      });
      if (correct) {
        right += 1; count.textContent = `✓ ${right}`;
        sound.right();
        question.classList.add('good');
        setTimeout(() => { if (!over) ask(); }, 250);
      } else {
        sound.wrong();
        question.classList.add('bad');
        slot().textContent = String(q.answer);
        setTimeout(() => { if (!over) ask(); }, 900);
      }
    }

    body.replaceChildren(h('div', { class: 'zoom-play' },
      h('div', { class: 'time-bar' }, fill), count, question, pad));
    ask();

    const tick = setInterval(() => {
      if (!screen.isConnected) { clearInterval(tick); return; }
      const left = Math.max(0, 1 - (performance.now() - t0) / (SECONDS * 1000));
      fill.style.width = `${left * 100}%`;
      if (left > 0) return;
      clearInterval(tick);
      over = true;
      reporter.flush();
      finish(right);
    }, 100);
  }

  function finish(right) {
    const r = game.rewards;
    const record = right > r.zoomiesBest;
    if (record) { r.zoomiesBest = right; addTreats(r, RECORD_BONUS); sound.levelUp(); } else sound.chest();
    save();
    bar.update();
    if (record) toast(`New record! +${RECORD_BONUS} 🦴`, 2600);
    body.replaceChildren(h('div', { class: 'zoom-intro' },
      h('img', { class: 'walk-pet jump', src: friendSrc(game.activeFriend), alt: '' }),
      h('h1', {}, `You got ${right} right!`),
      h('p', { class: 'score' }, record ? 'That is your best ever! 🏆' : `Your record is ${r.zoomiesBest}. Have another go!`),
      h('div', { class: 'hub-row' },
        h('button', { class: 'btn', onclick: () => go('hub') }, 'Back home'),
        h('button', { class: 'btn zoom', onclick: () => go('zoomies') }, 'Again ⚡'))));
  }

  intro();
  return screen;
}
