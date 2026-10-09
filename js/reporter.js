// js/reporter.js — answers wait on the tablet until the internet is there, then go to Supabase.
const OUTBOX = 'maths-pets-outbox';
const DEVICE = 'maths-pets-device';
const BATCH = 50;
const FIELDS = ['mode', 'track', 'level', 'question', 'correct_answer', 'given_answer', 'is_correct',
  'input_kind', 'mistake_tag', 'hint_used', 'seconds'];

export function createReporter({ url, key, store = globalThis.localStorage, fetchFn = globalThis.fetch?.bind(globalThis),
  now = () => new Date(), uuid = () => crypto.randomUUID() }) {
  const read = (k, d) => { try { const v = store.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const write = (k, v) => { try { store.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

  let deviceId = read(DEVICE, null);
  if (!deviceId) { deviceId = uuid(); write(DEVICE, deviceId); }
  let sending = false;

  function log(answer) {
    const r = { client_id: uuid(), device_id: deviceId, answered_at: now().toISOString() };
    for (const f of FIELDS) r[f] = answer[f] ?? null;
    write(OUTBOX, [...read(OUTBOX, []), r]);
  }

  async function flush() {
    if (sending) return 0;
    sending = true;
    let sent = 0;
    try {
      for (;;) {
        const batch = read(OUTBOX, []).slice(0, BATCH);
        if (!batch.length) break;
        const res = await fetchFn(`${url}/rest/v1/rpc/maths_pets_log`, {
          method: 'POST',
          headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_rows: batch }),
        });
        if (!res.ok) break;
        const ids = new Set(batch.map(b => b.client_id));
        write(OUTBOX, read(OUTBOX, []).filter(b => !ids.has(b.client_id)));
        sent += batch.length;
      }
    } catch { /* offline: try again later */ }
    finally { sending = false; }
    return sent;
  }

  return { log, flush, pending: () => read(OUTBOX, []).length, deviceId };
}
