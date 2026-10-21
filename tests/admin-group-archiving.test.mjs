import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20261021130000_group_archiving.sql', import.meta.url), 'utf8');
const adminRules = await readFile(new URL('../supabase/migrations/20261021140000_group_admin_rules.sql', import.meta.url), 'utf8');
const groups = await readFile(new URL('../src/components/MyGroups.tsx', import.meta.url), 'utf8');
const setup = await readFile(new URL('../src/components/RoundSetup.tsx', import.meta.url), 'utf8');
const team = await readFile(new URL('../src/components/TeamCreation.tsx', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('archiving frees the active Team slot and blocks new group rounds server-side', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS archived_at timestamptz/);
  assert.match(migration, /guard_one_active_owned_group/);
  assert.match(migration, /El grupo está archivado y no admite nuevas partidas/);
  assert.match(team, /\.is\(['"]archived_at['"], null\)/);
});

test('an archived group remains selectable in read-only history mode', () => {
  assert.match(groups, /archived_at/);
  assert.match(groups, /Archivado/);
  assert.match(setup, /isArchivedGroup/);
  assert.match(setup, /clasificación, jugadores y estadísticas/);
  assert.match(setup, /isGroupCreator && !hasLimitedAccess && !isArchivedGroup/);
  assert.match(setup, /!isArchivedGroup && <div[\s\S]{0,180}onViewActiveRounds/);
  assert.match(setup, /isArchivedGroup \? ["']back["'] : ["']home["']/);
  assert.match(app, /currentGroup\.archived_at \? \(\) => \{[\s\S]{0,250}setCurrentView\(['"]my-groups['"]\)/);
  assert.match(groups, /!group\.archived_at && \([\s\S]{0,700}Jugadores/);
});

test('an archived group owner or admin can permanently delete the complete group', () => {
  assert.match(adminRules, /delete_archived_owned_group/);
  assert.match(adminRules, /target\.user_auth_id=auth\.uid\(\)[\s\S]{0,180}m\.role='admin'/);
  assert.match(adminRules, /IF target\.archived_at IS NULL/);
  assert.match(adminRules, /DELETE FROM public\.groups WHERE id=p_group/);
  assert.match(groups, /requiredText="ELIMINAR"/);
});
