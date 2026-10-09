// js/app.js — loads the game, picks the screen, keeps everything saved and sent.
import { loadGame, saveGame, SAVE_KEY } from './storage.js';
import { createReporter } from './reporter.js';
import { createSound } from './sound.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { startScreen } from './ui/start.js';
import { hubScreen } from './ui/hub.js';
import { walkScreen } from './ui/walkScreen.js';
import { homeScreen } from './ui/home.js';
import { shopScreen } from './ui/shop.js';
import { zoomiesScreen } from './ui/zoomies.js';

const game = loadGame();
const reporter = createReporter({ url: SUPABASE_URL, key: SUPABASE_KEY });
const sound = createSound(game);
const root = document.getElementById('app');
const screens = { start: startScreen, hub: hubScreen, walk: walkScreen, home: homeScreen, shop: shopScreen, zoomies: zoomiesScreen };

// Another open copy of the game (the installed app and a browser tab) saved newer progress:
// stop saving this copy's older state and reload to pick the newer one up.
let stale = false;
addEventListener('storage', e => {
  if (e.key !== SAVE_KEY || stale) return;
  stale = true;
  location.reload();
});

function save() { if (!stale) saveGame(game); }

function go(name, params = {}) {
  const make = screens[name] ?? hubScreen;
  root.replaceChildren(make({ game, reporter, sound, go, save }, params));
  save();
}


go(game.name && game.rewards.friends.length ? 'hub' : 'start');

reporter.flush();
addEventListener('online', () => reporter.flush());
setInterval(() => reporter.flush(), 30000);
document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); reporter.flush(); } });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
