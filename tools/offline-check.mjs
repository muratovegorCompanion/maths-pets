// Dev check: does the game open with the network off after one online visit?
// Starts headless Chrome, visits the local server, waits for the service worker,
// then turns the network off and reloads. Run with the local server on :5173.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL_ = process.argv[2] ?? 'http://localhost:5173/';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${dir}`, '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

try {
  let targets;
  for (let i = 0; i < 50 && !targets; i++) { try { targets = await (await fetch('http://127.0.0.1:9333/json')).json(); } catch { await sleep(200); } }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const waiting = new Map();
  ws.addEventListener('message', m => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } });
  const send = (method, params = {}) => new Promise(r => { const n = ++id; waiting.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  const evaluate = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

  await send('Network.enable');
  await send('Page.navigate', { url: URL_ });
  for (let i = 0; i < 60; i++) {
    if (await evaluate(`navigator.serviceWorker.getRegistration().then(r => !!r?.active)`)) break;
    await sleep(500);
  }
  const online = await evaluate(`(async () => { const keys = await caches.keys(); const c = keys.find(k => k.startsWith('maths-pets-') && k !== 'maths-pets-fonts'); return { sw: !!(await navigator.serviceWorker.getRegistration())?.active, cache: c, files: c ? (await (await caches.open(c)).keys()).length : 0, h1: document.querySelector('h1')?.textContent }; })()`);
  console.log('online :', JSON.stringify(online));

  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await send('Page.reload', { ignoreCache: false });
  await sleep(3000);
  const offline = await evaluate(`({ h1: document.querySelector('h1')?.textContent ?? null, imgsLoaded: [...document.images].filter(i => i.complete && i.naturalWidth > 0).length, imgs: document.images.length, onLine: navigator.onLine })`);
  console.log('offline:', JSON.stringify(offline));
  ws.close();
} finally {
  const exited = new Promise(r => chrome.once('exit', r));
  chrome.kill();
  await exited;
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
