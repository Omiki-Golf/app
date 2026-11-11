import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Weekend grants Team access until its exact expiry without downgrading Premium', async () => {
  const source = await read('../src/utils/effectivePlan.ts');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  Function('module', 'exports', js)(module, module.exports);
  const { effectivePlan } = module.exports;
  const now = Date.parse('2026-11-11T10:00:00Z');
  assert.equal(effectivePlan({ plan_type: 'express', status: 'active', weekend_mode_until: '2026-11-18T10:00:00Z' }, now), 'team');
  assert.equal(effectivePlan({ plan_type: 'express', status: 'active', weekend_mode_until: '2026-11-11T10:00:00Z' }, now), 'express');
  assert.equal(effectivePlan({ plan_type: 'premium', status: 'active', weekend_mode_until: '2026-11-18T10:00:00Z' }, now), 'premium');
});

test('Weekend and every Pro-Shop add-on are wired to test activation and server limits', async () => {
  const [plans, shop, creation, migration] = await Promise.all([
    read('../src/components/PlansComparison.tsx'),
    read('../src/components/ProShop.tsx'),
    read('../src/components/TeamCreation.tsx'),
    read('../supabase/migrations/20261111100000_enable_weekend_and_pro_shop_addons.sql'),
  ]);
  assert.match(plans, /onStartWeekend\(weekendDays\)/);
  assert.match(shop, /activate_group_addons_for_testing/);
  for (const product of ['grupo-adicional', 'ampliacion-plantilla', 'temporada-simultanea']) {
    assert.match(shop, new RegExp(product));
    assert.match(migration, new RegExp(product));
  }
  assert.match(creation, /extraCapacity/);
  assert.match(migration, /THEN 32 ELSE 20/);
  assert.match(migration, /SELECT max_players INTO v_limit/);
  assert.match(migration, /activate_weekend_for_testing/);
});
