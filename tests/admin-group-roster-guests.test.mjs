import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const roster = await readFile(new URL('../src/components/GroupMemberList.tsx', import.meta.url), 'utf8');
const service = await readFile(new URL('../src/services/userService.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261021160000_group_roster_guests.sql', import.meta.url), 'utf8');

test('group roster includes guests and offers the same registered-or-guest addition flow', () => {
  assert.match(migration, /p\.auth_user_id IS NULL/);
  assert.match(migration, /'is_guest',true/);
  assert.match(roster, /searchByNick/);
  assert.match(roster, /addGroupGuest/);
  assert.match(roster, /HCP 18 hoyos/);
});

test('compact roster uses a trash icon and administrator switch', () => {
  assert.match(roster, /Trash2/);
  assert.match(roster, /role="switch"/);
  assert.doesNotMatch(roster, />Eliminar del grupo<\/WriteButton>/);
  assert.doesNotMatch(roster, />Hacer administrador<\/WriteButton>/);
  assert.match(service, /manage_group_guest_player/);
});
