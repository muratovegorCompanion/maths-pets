// tests/reporter.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createReporter } from '../js/reporter.js';

const memStore = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
let n = 0; const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const row = { mode: 'walk', track: 'add', level: 5, question: '59 + 25', correct_answer: 84, given_answer: 74,
  is_correct: false, input_kind: 'choice', mistake_tag: 'forgot_carry', hint_used: true, seconds: 6.2 };

function make(fetchFn, store = memStore()) {
  return createReporter({ url: 'https://x.supabase.co', key: 'k', store, fetchFn, now: () => new Date('2026-10-09T10:00:00Z'), uuid });
}

test('offline: answers wait in the outbox and nothing throws', async () => {
  const r = make(async () => { throw new TypeError('offline'); });
  r.log(row); r.log(row);
  assert.equal(await r.flush(), 0);
  assert.equal(r.pending(), 2);
});

test('back online: the outbox is sent once and emptied', async () => {
  const calls = [];
  let online = false;
  const r = make(async (url, opts) => {
    if (!online) throw new TypeError('offline');
    calls.push(JSON.parse(opts.body));
    return { ok: true, json: async () => 2 };
  });
  r.log(row); r.log(row);
  await r.flush();
  online = true;
  assert.equal(await r.flush(), 2);
  assert.equal(r.pending(), 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].p_rows.length, 2);
  assert.equal(await r.flush(), 0);
  assert.equal(calls.length, 1);
});

test('rows carry device id, client id and time, never a name', async () => {
  let sent;
  const r = make(async (url, opts) => { sent = JSON.parse(opts.body).p_rows[0]; return { ok: true, json: async () => 1 }; });
  r.log({ ...row, name: 'Mia' });
  await r.flush();
  assert.equal(sent.device_id, r.deviceId);
  assert.match(sent.client_id, /^[0-9a-f-]{36}$/);
  assert.equal(sent.answered_at, '2026-10-09T10:00:00.000Z');
  assert.equal('name' in sent, false);
});

test('a server error keeps the rows for later', async () => {
  const r = make(async () => ({ ok: false, status: 500, json: async () => ({}) }));
  r.log(row);
  await r.flush();
  assert.equal(r.pending(), 1);
});

test('the device id survives a restart', () => {
  const store = memStore();
  const a = make(async () => ({ ok: true, json: async () => 0 }), store);
  const b = make(async () => ({ ok: true, json: async () => 0 }), store);
  assert.equal(a.deviceId, b.deviceId);
});

test('rows logged during a send are not lost', async () => {
  let release, calls = 0;
  const r = make(() => {
    calls += 1;
    if (calls === 1) return new Promise(res => { release = () => res({ ok: true, json: async () => 1 }); });
    return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
  });
  r.log(row);
  const p = r.flush();
  r.log(row);
  release(); await p;
  assert.equal(r.pending(), 1);
});
