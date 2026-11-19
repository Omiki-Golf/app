import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const groups = await readFile(new URL('../src/components/MyGroups.tsx', import.meta.url), 'utf8');
const members = await readFile(new URL('../src/components/GroupMemberList.tsx', import.meta.url), 'utf8');
const rules = await readFile(new URL('../supabase/migrations/20261021140000_group_admin_rules.sql', import.meta.url), 'utf8');

test('the home join code searches active group rounds too', () => {
  assert.match(app, /getRoundByAccessCode\(code, currentGroup\?\.id, !currentGroup\)/);
  assert.match(app, /!currentGroup && round\.group_id[\s\S]{0,450}setHasLimitedAccess\(true\)/);
});

test('owner and delegated admin can archive and delete, but only owner manages the single delegated admin', () => {
  assert.match(groups, /group\.access === ['"]owner['"] \|\| group\.access === ['"]admin['"]/);
  assert.match(rules, /m\.role='admin'/);
  assert.match(rules, /Solo el creador puede cambiar administradores/);
  assert.match(rules, /solo puede tener un administrador además del creador/);
  assert.match(members, /delegatedAdminExists/);
  assert.match(members, /<Crown/);
  assert.match(members, /Quitar administrador/);
});

test('archived groups sort last and hide their access code', () => {
  // Mismo orden que Inicio (ver homeGroupOrder); los archivados, al final.
  assert.match(groups, /const sortGroups = \(items: MyGroup\[\]\) => homeGroupOrder\(items\)/);
  assert.match(groups, /select\('role, group_id, joined_at, admin_since'\)/);
  assert.match(groups, /!group\.archived_at && <div className="flex items-center gap-3 mb-3">/);
});

test('member cards show only nick, role and both handicaps without technical details', () => {
  assert.match(members, /HCP <strong[\s\S]{0,80}member\.handicap_18[\s\S]{0,160}handicap9\(member\.handicap_18\)/);
  // El HCP de 9 hoyos no muestra decimales: se redondea y se marca con *.
  assert.match(members, /Number\.isInteger\(half\) \? String\(half\) : `\$\{Math\.round\(half\)\}\*`/);
  assert.doesNotMatch(members, /<details/);
  assert.doesNotMatch(members, /UUID de cuenta/);
  assert.doesNotMatch(members, /profile\?\.display_name/);
});

test('member list finds the group creator itself when the screen does not pass it, so the creator never shows as Admin', () => {
  // Clasificación y jugadores (GamePoints) no pasa ownerId: la lista lo lee del grupo.
  assert.match(members, /select\('max_players, user_auth_id, created_by'\)/);
  assert.match(members, /setFetchedOwner\(\{ groupId, ownerId: capacity\.data\?\.user_auth_id \|\| capacity\.data\?\.created_by \|\| null \}\)/);
  assert.match(members, /const ownerId = ownerIdProp \?\? \(fetchedOwner\?\.groupId === groupId/);
  assert.match(members, /member\.user_id === ownerId \? <span/);
});

test('rankings card says it shows every day the group completed rounds, not only today', async () => {
  const setup = await readFile(new URL('../src/components/RoundSetup.tsx', import.meta.url), 'utf8');
  assert.match(setup, /Consulta la clasificación de cada día en que el grupo ha completado partidas, los jugadores registrados y sus handicaps\./);
  assert.doesNotMatch(setup, /completadas en el dia/);
});
