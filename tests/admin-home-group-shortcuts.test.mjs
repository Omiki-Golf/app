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

test('home groups come in three labelled blocks, sized by priority: created, administered and member', async () => {
  const source = await readFile(new URL('../src/components/HomeScreen.tsx', import.meta.url), 'utf8');
  assert.match(source, /const sections = homeGroupSections\(groupShortcuts\)/);
  // Los Weekend creados por ti van aparte, en «Tus Weekends».
  assert.match(source, /const ownedGroups = sections\.owned\.filter\(group => groupTier\(group\) !== 'weekend'\)/);
  assert.match(source, /const ownedWeekends = sections\.owned\.filter\(group => groupTier\(group\) === 'weekend'\)/);
  assert.match(source, /sections\.admin\.map/);
  assert.match(source, /sections\.member\.map/);
  for (const key of ['roundsLabel', 'groupsOwned', 'groupsAdmin', 'groupsWeekend', 'groupsMember']) assert.ok(source.includes(`t('home.${key}')`), key);
  // Creados: a todo el ancho y más altos; administrados y de miembro: dos columnas, cada vez más pequeños.
  assert.match(source, /owner: 'h-\[52px\][^']*text-base'/);
  assert.match(source, /admin: 'h-11[^']*text-sm'/);
  assert.match(source, /member: 'h-9[^']*text-\[13px\]'/);
  // Administrados y de miembro van en dos columnas (Partidas, según haya grupos o no).
  assert.equal(source.match(/<div className="grid grid-cols-2 gap-2">/g)?.length, 2);
  // Rellenos para creados y administrados; solo contorno para miembro.
  assert.match(source, /level === 'member' \? `bg-card \$\{tone\.outlineButton\}` : `\$\{tone\.button\} \$\{tone\.border\} shadow-card`/);
  // Un grupo solo, o el último de un número impar, ocupa las dos columnas.
  assert.match(source, /const isWide = \(index: number, total: number\) => total % 2 === 1 && index === total - 1/);
  assert.match(source, /wide \? 'col-span-2' : ''/);
});

test('home weekend groups show no expiry tag; the full notice appears only in their last week', async () => {
  const source = await readFile(new URL('../src/components/HomeScreen.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /expiresLabel|home\.expires/);
  assert.match(source, /\{weekendLastWeek\(group\.weekend_mode_until, group\.weekend_days\) && \(\s*<WeekendGroupNotice/);
});

test('home group shortcuts show two crowns for creator, one for admin and none for member', async () => {
  const source = await readFile(new URL('../src/components/HomeScreen.tsx', import.meta.url), 'utf8');
  assert.match(source, /level === 'owner' && <span[^\n]*title="Creador" aria-label="Creador"><Crown[^\n]*<Crown/);
  assert.match(source, /level === 'admin' && <Crown[^\n]*aria-label="Administrador" \/>/);
  assert.doesNotMatch(source, /level === 'member' && <Crown/);
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
  assert.match(source, /relative mb-\[26px\] flex min-h-11 items-center justify-between gap-3/);
});

test('home blocks are headed cards in order: rounds, groups, admin, weekends, member', async () => {
  const source = await readFile(new URL('../src/components/HomeScreen.tsx', import.meta.url), 'utf8');
  assert.match(source, /function HomeSection\(\{ title, children \}/);
  assert.match(source, /<section className="rounded-2xl border border-line bg-card p-3 shadow-soft">/);
  const order = ['roundsLabel', 'groupsOwned', 'groupsAdmin', 'groupsWeekend', 'groupsMember']
    .map(key => source.indexOf(`<HomeSection title={t('home.${key}')}>`));
  assert.ok(order.every(index => index > 0), 'cada bloque tiene su ficha');
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test('home rounds block: label and create/join side by side at the creator-group height; logos scaled together', async () => {
  const source = await readFile(new URL('../src/components/HomeScreen.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes("{t('home.roundsLabel')}"));
  assert.ok(source.includes("t('home.createGameShort')") && source.includes("t('home.joinGameShort')"));
  assert.equal(source.match(/flex h-\[52px\] min-w-0 items-center justify-center/g)?.length, 2);
  // Logo superior 288 → 224 px; la «O» inferior se reduce en la misma proporción (112 → 87 px).
  assert.match(source, /alt="OMIKI Golf"[^\n]*w-56/);
  assert.match(source, /Omiki_O_VerdeAmarillo[^\n]*w-\[87px\]/);
});

test('home top icons share one size and vertical alignment', async () => {
  const home = await readFile(new URL('../src/components/HomeScreen.tsx', import.meta.url), 'utf8');
  const theme = await readFile(new URL('../src/components/ThemeToggle.tsx', import.meta.url), 'utf8');
  const language = await readFile(new URL('../src/components/LanguageSwitcher.tsx', import.meta.url), 'utf8');
  const reset = await readFile(new URL('../src/components/ResetExpressRounds.tsx', import.meta.url), 'utf8');
  const messages = await readFile(new URL('../src/components/GlobalMessagesButton.tsx', import.meta.url), 'utf8');
  assert.match(home, /relative mb-\[26px\] flex min-h-11 items-center/);
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

test('without any group card, rounds use two wide rows with full labels and the O logo sits in the free space', async () => {
  const source = await readFile(new URL('../src/components/HomeScreen.tsx', import.meta.url), 'utf8');
  assert.match(source, /const hasGroupCards = groupShortcuts\.length > 0 \|\| canCreateGroup/);
  assert.match(source, /grid gap-2 \$\{hasGroupCards \? 'grid-cols-2' : 'grid-cols-1'\}/);
  assert.ok(source.includes("{hasGroupCards ? t('home.createGameShort') : t('home.createGame')}"));
  assert.ok(source.includes("{hasGroupCards ? t('home.joinGameShort') : t('home.joinGame')}"));
  // La «O» ocupa el hueco que sobra (flex-1) dentro de una columna que llena la pantalla, sin añadir altura.
  assert.match(source, /<div className="max-w-md w-full flex flex-col">/);
  assert.match(source, /<div className="flex flex-1 items-center justify-center">\s*<img src="\/images\/Omiki_O_VerdeAmarillo/);
});

test('Mis grupos uses the home order: created, administered, own Weekends, member; oldest first; archived last', async () => {
  const ts = (await import('typescript')).default;
  const source = await readFile(new URL('../src/utils/homeGroups.ts', import.meta.url), 'utf8');
  const module = { exports: {} };
  Function('module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(module, module.exports);
  const { homeGroupOrder } = module.exports;
  const ordered = homeGroupOrder([
    { name: 'Miembro', access: 'member', since: '2026-11-01T10:00:00Z' },
    { name: 'TEAM 3ero', access: 'owner', since: '2026-11-19T12:00:00Z' },
    { name: 'Archivado', access: 'owner', since: '2026-10-01T10:00:00Z', archived_at: '2026-11-10T10:00:00Z' },
    { name: 'Weekend', access: 'owner', group_type: 'weekend', since: '2026-11-02T10:00:00Z' },
    { name: 'TEAM 1ERO', access: 'owner', since: '2026-11-19T10:00:00Z' },
    { name: 'Admin', access: 'admin', since: '2026-11-05T10:00:00Z' },
    { name: 'TEAM 2do', access: 'owner', since: '2026-11-19T11:00:00Z' },
  ]);
  assert.deepEqual(ordered.map(group => group.name), ['TEAM 1ERO', 'TEAM 2do', 'TEAM 3ero', 'Admin', 'Weekend', 'Miembro', 'Archivado']);
});
