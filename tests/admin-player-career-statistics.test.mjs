import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const statistics = await readFile(new URL('../src/components/CareerStatistics.tsx', import.meta.url), 'utf8');

test('Player career statistics hide Moments while other plans keep it', () => {
  assert.match(app, /showMoments=\{activePlanType !== 'player'\}/);
  assert.match(statistics, /showMoments && <Section icon=\{Award\} title="Momentos">/);
});
