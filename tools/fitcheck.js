// Paste into the page (dev only). Plays through screens and reports anything outside the viewport.
window.__fit = async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const fit = label => {
    const bad = [];
    for (const el of document.querySelectorAll('#app *')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.bottom > innerHeight + 1 || r.right > innerWidth + 1 || r.top < -1 || r.left < -1) bad.push(el.className || el.tagName);
    }
    const d = document.documentElement;
    const dim = sel => { const e = document.querySelector(sel); if (!e) return ''; const r = e.getBoundingClientRect(); return `${sel}@${Math.round(r.top)}+${Math.round(r.height)}`; };
    if (bad.length) bad.unshift(['.question', '.hint', '.hint-row', '.keypad', '.walk-body'].map(dim).join(' '));
    return `${label}: ${bad.length || d.scrollHeight > innerHeight || d.scrollWidth > innerWidth ? 'OVERFLOW ' + [...new Set(bad)].slice(0, 6).join(',') : 'ok'}`;
  };
  const solve = t => { const m = t.match(/(\d+)\s*([+×])\s*(\d+)/); return m[2] === '+' ? +m[1] + +m[3] : m[1] * m[3]; };
  const qText = () => document.querySelector('.question span').textContent;
  const typeIn = n => { for (const d of String(n)) [...document.querySelectorAll('.kp-key')].find(b => b.textContent === d).click(); document.querySelector('.kp-ok').click(); };
  const out = [`${innerWidth}x${innerHeight}`];
  out.push(fit('hub'));
  document.querySelector('.btn.primary.big').click(); await sleep(150);
  out.push(fit(document.querySelector('.choices') ? 'walk-choice' : 'walk-keypad'));
  const ans = solve(qText());
  if (document.querySelector('.choices')) [...document.querySelectorAll('.choice')].find(b => +b.textContent !== ans).click();
  else typeIn(ans + 1);
  await sleep(900);
  out.push(fit('hint'));
  // finish the hint
  for (let i = 0; i < 4 && document.querySelector('.hint-row.now'); i++) {
    const sum = document.querySelector('.hint-row.now .hint-sum').firstChild.textContent;
    const m = sum.match(/(\d+)\s*\+\s*(\d+)/), tens = sum.match(/(\d+) tens/);
    const v = m ? +m[1] + +m[2] : tens ? tens[1] * 10 : solve(qText());
    typeIn(v); await sleep(50);
  }
  out.push(fit('hint-done'));
  document.querySelector('.btn.primary')?.click(); await sleep(100);
  for (let i = 0; i < 12 && document.querySelector('.question'); i++) {
    const a = solve(qText());
    if (document.querySelector('.choices')) [...document.querySelectorAll('.choice')].find(b => +b.textContent === a).click(); else typeIn(a);
    await sleep(1100);
  }
  out.push(fit('chest'));
  document.querySelector('.chest')?.click(); await sleep(400);
  out.push(fit('prize'));
  return out.join(' | ');
};
