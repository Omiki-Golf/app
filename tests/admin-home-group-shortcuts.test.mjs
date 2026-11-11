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
});

test('home group shortcuts show two crowns for creator, one for admin and none for member', async () => {
  const source = await readFile(new URL('../src/components/HomeScreen.tsx', import.meta.url), 'utf8');
  assert.match(source, /ROLE_ORDER: Record<GroupAccess, number> = \{ owner: 0, admin: 1, member: 2 \}/);
  assert.match(source, /\[\.\.\.groupShortcuts\]\.sort\(\(a, b\) => ROLE_ORDER\[a\.access\] - ROLE_ORDER\[b\.access\]\)/);
  assert.match(source, /group\.access === 'owner'.*<Crown.*<Crown/);
  assert.match(source, /group\.access === 'admin' && <Crown/);
  assert.doesNotMatch(source, /group\.access === 'member' &&/);
});

test('home content starts with extra space below the top icon row', async () => {
  const source = await readFile(new URL('../src/components/HomeScreen.tsx', import.meta.url), 'utf8');
  assert.match(source, /relative mb-8 flex min-h-11 items-center justify-between gap-3/);
});

test('home top icons share one size and vertical alignment', async () => {
  const home = await readFile(new URL('../src/components/HomeScreen.tsx', import.meta.url), 'utf8');
  const theme = await readFile(new URL('../src/components/ThemeToggle.tsx', import.meta.url), 'utf8');
  const language = await readFile(new URL('../src/components/LanguageSwitcher.tsx', import.meta.url), 'utf8');
  const reset = await readFile(new URL('../src/components/ResetExpressRounds.tsx', import.meta.url), 'utf8');
  const messages = await readFile(new URL('../src/components/GlobalMessagesButton.tsx', import.meta.url), 'utf8');
  assert.match(home, /relative mb-8 flex min-h-11 items-center/);
  assert.match(home, /inline-flex h-11 w-11 shrink-0 items-center justify-center/);
  for (const source of [theme, language, reset, messages]) assert.match(source, /h-11 w-11/);
  assert.match(theme, /<Sun size=\{21\}/);
  assert.match(reset, /<Trash2 size=\{21\}/);
});

test('the shared app link and QR always default to the production app domain', async () => {
  const source = await readFile(new URL('../src/components/ShareModal.tsx', import.meta.url), 'utf8');
  assert.match(source, /const OMIKI_APP_URL = 'https:\/\/app\.omikigolf\.com'/);
  assert.match(source, /shareUrl = OMIKI_APP_URL/);
  assert.doesNotMatch(source, /shareUrl = window\.location\.origin/);
});

test('adding a player does not flash a light handicap input in dark mode', async () => {
  const source = await readFile(new URL('../src/components/PlayerSetup.tsx', import.meta.url), 'utf8');
  assert.match(source, /className="w-full bg-card px-4 py-3 text-ink/);
  assert.doesNotMatch(source, /disabled:bg-gray-100/);
});
