import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('home loads owned, administered and member groups as direct shortcuts', async () => {
  const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(source, /group_members[^\n]*select\('group_id, role, joined_at, admin_since'\)/);
  assert.match(source, /access: 'owner' as const, since: group\.created_at/);
  assert.match(source, /item\.role === 'admin' \? \(item\.admin_since \?\? item\.joined_at\) : item\.joined_at/);
  assert.match(source, /access: 'owner'/);
  assert.match(source, /item\.role === 'admin'/);
  assert.match(source, /groupShortcuts=\{homeGroups\.map/);
  assert.match(source, /handleGroupJoined\(selectedGroup\)/);
});

test('home groups come in three blocks: created, administered and member groups in two columns', async () => {
  const source = await readFile(new URL('../src/components/HomeScreen.tsx', import.meta.url), 'utf8');
  assert.match(source, /const sections = homeGroupSections\(groupShortcuts\)/);
  assert.match(source, /sections\.owned\.map/);
  assert.match(source, /sections\.admin\.map/);
  // Una sola pastilla de miembro va a todo el ancho; si hay más, en dos columnas.
  assert.match(source, /sections\.member\.length === 1 \? 'grid-cols-1' : 'grid-cols-2'/);
  assert.match(source, /\$\{tone\.button\} \$\{tone\.border\} shadow-card/);
  assert.match(source, /bg-card px-3 py-2\.5 rounded-xl[^`]*\$\{tone\.outlineButton\}/);
});

test('home group shortcuts show two crowns for creator, one for admin and none for member', async () => {
  const source = await readFile(new URL('../src/components/HomeScreen.tsx', import.meta.url), 'utf8');
  assert.match(source, /title="Creador" aria-label="Creador"><Crown[^\n]*<Crown/);
  assert.match(source, /<Crown size=\{21\} fill="currentColor" className="shrink-0" aria-label="Administrador" \/>/);
  const memberBlock = source.slice(source.indexOf('sections.member.map'), source.indexOf('</WriteButton>', source.indexOf('sections.member.map')));
  assert.doesNotMatch(memberBlock, /<Crown/);
});

test('each home group block is sorted from oldest to newest by its own date', async () => {
  const ts = (await import('typescript')).default;
  const source = await readFile(new URL('../src/utils/homeGroups.ts', import.meta.url), 'utf8');
  const module = { exports: {} };
  Function('module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(module, module.exports);
  const { homeGroupSections } = module.exports;
  const sections = homeGroupSections([
    { name: 'GOLFERS II', access: 'owner', since: '2026-11-17T23:20:09Z' },
    { name: 'Socio', access: 'member', since: '2026-11-15T10:00:00Z' },
    { name: 'GOLFERS', access: 'owner', since: '2026-11-11T21:06:01Z' },
    { name: 'Admin nuevo', access: 'admin', since: '2026-11-16T10:00:00Z' },
    { name: 'Admin antiguo', access: 'admin', since: '2026-11-01T10:00:00Z' },
    { name: 'Primero', access: 'member', since: '2026-11-02T10:00:00Z' },
  ]);
  assert.deepEqual(sections.owned.map(g => g.name), ['GOLFERS', 'GOLFERS II']);
  assert.deepEqual(sections.admin.map(g => g.name), ['Admin antiguo', 'Admin nuevo']);
  assert.deepEqual(sections.member.map(g => g.name), ['Primero', 'Socio']);
});

test('admin_since is set when a member becomes admin and cleared when the role is removed', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE public.group_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid,user_id uuid,role text,joined_at timestamptz DEFAULT now());
    INSERT INTO public.group_members(role,joined_at) VALUES('admin','2026-10-01T10:00:00Z'),('member','2026-10-02T10:00:00Z');`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261122100000_group_admin_since.sql', import.meta.url), 'utf8'));
  const rows = async () => (await db.query('SELECT role, admin_since FROM public.group_members ORDER BY joined_at')).rows;
  const [oldAdmin, member] = await rows();
  assert.equal(new Date(oldAdmin.admin_since).toISOString(), '2026-10-01T10:00:00.000Z');
  assert.equal(member.admin_since, null);
  await db.query("UPDATE public.group_members SET role='admin' WHERE role='member'");
  assert.ok((await rows())[1].admin_since);
  await db.query("UPDATE public.group_members SET role='member' WHERE joined_at='2026-10-02T10:00:00Z'");
  assert.equal((await rows())[1].admin_since, null);
  await db.close();
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
