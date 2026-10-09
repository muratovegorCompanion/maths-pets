// js/ui/keypad.js — the big number keypad used for answers, hints and Zoomies.
import { h } from './dom.js';

export function keypad({ maxDigits = 3, onChange = () => {}, onSubmit, sound = null }) {
  let value = '';
  const ok = h('button', { class: 'kp-key kp-ok', 'aria-label': 'Check' }, '✓');

  function render() { ok.disabled = !value; onChange(value); }
  function press(d) {
    if (value.length >= maxDigits) return;
    value = value === '0' ? d : value + d;
    sound?.tap();
    render();
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
    .map(d => h('button', { class: 'kp-key', onclick: () => press(d) }, d));
  const back = h('button', { class: 'kp-key kp-back', 'aria-label': 'Delete', onclick: () => { value = value.slice(0, -1); render(); } }, '⌫');
  const zero = h('button', { class: 'kp-key', onclick: () => press('0') }, '0');
  ok.addEventListener('click', () => {
    if (!value) return;
    const v = Number(value);
    value = '';
    render();
    onSubmit(v);
  });

  const el = h('div', { class: 'keypad' }, ...keys, back, zero, ok);
  el.reset = () => { value = ''; render(); };
  render();
  return el;
}
