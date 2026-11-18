import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const load = async path => {
  const js = ts.transpileModule(await read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  Function('module', 'exports', js)(module, module.exports);
  return module.exports;
};

test('Weekend expiry is counted in Madrid calendar days and shown as 23:59', async () => {
  const { weekendDaysLeft, weekendExpiryText, weekendLastWeek } = await load('../src/utils/weekendMode.ts');
  // 18/11 23:59:59 en Madrid (UTC+1).
  const until = '2026-11-18T22:59:59Z';
  assert.equal(weekendDaysLeft(until, Date.parse('2026-11-18T10:00:00Z')), 0);
  assert.equal(weekendExpiryText(until, Date.parse('2026-11-18T10:00:00Z')), 'hoy a las 23:59 h');
  assert.equal(weekendExpiryText(until, Date.parse('2026-11-17T22:30:00Z')), 'mañana a las 23:59 h');
  assert.equal(weekendExpiryText(until, Date.parse('2026-11-11T12:00:00Z')), 'el 18 de noviembre a las 23:59 h');
  assert.equal(weekendDaysLeft(until, Date.parse('2026-11-18T23:00:00Z')), null);
  // Solo el Weekend de 3 meses avisa en su última semana.
  assert.equal(weekendLastWeek(until, '2026-08-20T10:00:00Z', Date.parse('2026-11-12T10:00:00Z')), true);
  assert.equal(weekendLastWeek(until, '2026-08-20T10:00:00Z', Date.parse('2026-11-05T10:00:00Z')), false);
  assert.equal(weekendLastWeek(until, '2026-11-11T10:00:00Z', Date.parse('2026-11-12T10:00:00Z')), false);
});

test('Weekend ends at end of day, allows one group per purchase and archives itself', async () => {
  const sql = await read('../supabase/migrations/20261118100000_weekend_end_of_day_and_auto_archive.sql');
  assert.match(sql, /v_until := public\.weekend_end_of_day\(/);
  assert.match(sql, /Ya tienes un grupo Weekend activo: %/);
  assert.match(sql, /Este Weekend ya tiene su grupo/);
  assert.match(sql, /UPDATE public\.groups SET archived_at=weekend_mode_until/);
  assert.match(sql, /cron\.schedule\('archive-expired-weekend-groups'/);
  assert.match(sql, /group_type='weekend' AND weekend_mode_until<=clock_timestamp\(\)/);
});

test('Home offers Team from the last-week notice and loaders archive expired Weekends', async () => {
  const [app, home, groups, creation, plans] = await Promise.all([
    read('../src/App.tsx'),
    read('../src/components/HomeScreen.tsx'),
    read('../src/components/MyGroups.tsx'),
    read('../src/components/TeamCreation.tsx'),
    read('../src/components/PlansComparison.tsx'),
  ]);
  assert.match(app, /setPlansContext\('team'\)/);
  assert.match(app, /initialPlan=\{plansContext === 'team' \? 'team' : undefined\}/);
  assert.match(plans, /useState<DisplayPlan>\(initialPlan \?\?/);
  assert.match(home, /weekendLastWeek\(group\.weekend_mode_until, group\.created_at\)/);
  assert.match(home, /Contratar Team/);
  assert.match(app, /rpc\('archive_expired_weekend_groups'\)/);
  assert.match(groups, /rpc\('archive_expired_weekend_groups'\)/);
  assert.match(creation, /Ya tienes tu grupo Weekend/);
});
