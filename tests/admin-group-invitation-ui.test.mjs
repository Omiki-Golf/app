import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const notifications = await readFile(new URL('../src/components/NotificationsBell.tsx', import.meta.url), 'utf8');
const members = await readFile(new URL('../src/components/GroupMemberList.tsx', import.meta.url), 'utf8');
const service = await readFile(new URL('../src/services/userService.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261022100000_archive_cancels_invitations.sql', import.meta.url), 'utf8');

test('accepting a group invitation opens My groups and invitation copy is one question', () => {
  assert.match(notifications, /status === 'accepted'\) onInvitationAccepted\(\)/);
  assert.match(app, /onInvitationAccepted=\{\(\) => \{[\s\S]{0,180}setCurrentView\('my-groups'\)/);
  assert.match(notifications, /Quieres aceptar la invitación de[\s\S]{0,120}al grupo/);
  assert.doesNotMatch(notifications, />Invitaciones a grupos</);
});

test('owners see invitation states separately and archived groups cancel pending invitations', () => {
  assert.match(members, /\['accepted', 'pending', 'rejected'\]/);
  assert.match(members, /Aceptadas/);
  assert.match(members, /Pendientes/);
  assert.match(members, /Rechazadas/);
  assert.match(service, /groups!inner/);
  assert.match(service, /invitation\.group\?\.archived_at/);
  assert.match(migration, /DELETE FROM public\.group_invitations WHERE group_id=p_group AND status='pending'/);
});
