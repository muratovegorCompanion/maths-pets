import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VOICES } from '../js/sound.js';
import { FRIENDS } from '../js/catalog.js';

test('every kind of friend has its own voice, and the sound files exist', () => {
  const species = new Set(FRIENDS.map(f => f.species));
  for (const s of species) {
    assert.ok(VOICES[s]?.length, `no voice for ${s}`);
    for (const f of VOICES[s]) assert.ok(fs.existsSync(new URL(`../${f}`, import.meta.url)), `missing ${f}`);
  }
  const all = [...species].map(s => VOICES[s].join());
  assert.equal(new Set(all).size, all.length, 'two kinds of friend share the same voice');
});
