import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('plans and group cards share the omikigolf.com tier palette', async () => {
  const [palette, plans, home, groups, app] = await Promise.all([
    read('../src/utils/tierColors.ts'),
    read('../src/components/PlansComparison.tsx'),
    read('../src/components/HomeScreen.tsx'),
    read('../src/components/MyGroups.tsx'),
    read('../src/App.tsx'),
  ]);

  for (const color of ['sky-300', 'emerald-500', 'lime-400', 'fuchsia-500', 'orange-500']) {
    assert.match(palette, new RegExp(color));
  }
  assert.match(palette, /express: \{[\s\S]*?border: 'border-sky-300'[\s\S]*?button: 'bg-sky-300/);
  assert.match(palette, /player: \{[\s\S]*?border: 'border-emerald-500'[\s\S]*?button: 'bg-emerald-500/);
  assert.match(palette, /team: \{[\s\S]*?border: 'border-lime-400'[\s\S]*?button: 'bg-lime-400/);
  assert.match(palette, /premium: \{[\s\S]*?border: 'border-fuchsia-500'[\s\S]*?button: 'bg-fuchsia-500/);
  assert.match(palette, /weekend: \{[\s\S]*?border: 'border-orange-500'[\s\S]*?button: 'bg-orange-500/);
  assert.match(plans, /tierColors\.express/);
  assert.match(plans, /tierColors\.weekend/);
  assert.match(home, /groupTier\(group\)/);
  assert.match(groups, /groupTier\(group\)/);
  assert.match(groups, /group_type, premium_branding/);
  assert.match(app, /premium_branding: group\.premium_branding/);
  assert.doesNotMatch(app, /access === 'owner' && basePlanType === 'premium'/);
});

test('Weekend wins over Premium when choosing a group card tone', async () => {
  const source = await read('../src/utils/tierColors.ts');
  assert.ok(source.indexOf("group.group_type === 'weekend'") < source.indexOf('group.premium_branding'));
});
