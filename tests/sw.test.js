import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { swSource } from '../tools/build-sw.mjs';

test('sw.js is up to date with the game files (run: node tools/build-sw.mjs)', async () => {
  assert.equal(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), await swSource());
});
