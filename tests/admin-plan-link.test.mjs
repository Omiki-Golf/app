import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readPlanLink } from '../src/utils/planLink.ts';

test('a website link opens Plans with the chosen plan and billing period', () => {
  assert.deepEqual(readPlanLink('?plan=player&period=annual'), { plan: 'player', annual: true });
  assert.deepEqual(readPlanLink('?plan=Team&period=monthly'), { plan: 'team', annual: false });
  assert.deepEqual(readPlanLink('?plan=premium'), { plan: 'premium', annual: true });
  assert.deepEqual(readPlanLink('?plan=weekend'), { plan: 'weekend', annual: true });
  assert.equal(readPlanLink('?plan=gold'), null);
  assert.equal(readPlanLink(''), null);
});

test('the app starts on Plans when the link names a plan and clears it afterwards', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /useState\(\(\) => readPlanLink\(window\.location\.search\)\)/);
  assert.match(app, /const initialViewFromLink: ViewType = planLink \? 'plans' : 'main';/);
  assert.match(app, /initialPlan=\{planLink\?\.plan \?\?/);
  assert.match(app, /initialAnnual=\{planLink\?\.annual\}/);
  assert.match(app, /clearPlanLink\(\)/);
});
