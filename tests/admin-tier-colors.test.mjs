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

  for (const color of ['sky-400', 'lime-400', 'amber-400', 'fuchsia-400', 'orange-500']) {
    assert.match(palette, new RegExp(color));
  }
  assert.match(plans, /tierColors\.express/);
  assert.match(plans, /tierColors\.weekend/);
  assert.match(home, /groupTier\(group\)/);
  assert.match(groups, /groupTier\(\{ \.\.\.group, premium_branding:/);
  assert.match(groups, /group_type, premium_branding/);
  assert.match(app, /premium_branding: group\.premium_branding \|\| \(access === 'owner' && basePlanType === 'premium'\)/);
  assert.match(groups, /group\.access === 'owner' && isPremium/);
});

test('Weekend wins over Premium when choosing a group card tone', async () => {
  const source = await read('../src/utils/tierColors.ts');
  assert.ok(source.indexOf("group.group_type === 'weekend'") < source.indexOf('group.premium_branding'));
});
