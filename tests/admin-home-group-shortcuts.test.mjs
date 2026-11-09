import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('home loads owned, administered and member groups as direct shortcuts', async () => {
  const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(source, /group_members[^\n]*select\('group_id, role'\)/);
  assert.match(source, /access: 'owner'/);
  assert.match(source, /item\.role === 'admin'/);
  assert.match(source, /groupShortcuts=\{homeGroups\.map/);
  assert.match(source, /handleGroupJoined\(selectedGroup\)/);
});

test('managed groups are solid amber and member groups use the outlined amber variant', async () => {
  const source = await readFile(new URL('../src/components/HomeScreen.tsx', import.meta.url), 'utf8');
  assert.match(source, /group\.access === 'owner' \|\| group\.access === 'admin'/);
  assert.match(source, /border-amber-500 bg-amber-500 text-amber-950/);
  assert.match(source, /border-amber-500 bg-card text-amber-500/);
  assert.match(source, />Miembro</);
});
