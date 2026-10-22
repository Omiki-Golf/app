import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createGroupDatabase } from './helpers/group-database.mjs';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const notifications = await readFile(new URL('../src/components/NotificationsBell.tsx', import.meta.url), 'utf8');
const members = await readFile(new URL('../src/components/GroupMemberList.tsx', import.meta.url), 'utf8');
const service = await readFile(new URL('../src/services/userService.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261022100000_archive_cancels_invitations.sql', import.meta.url), 'utf8');
const archiveFix = await readFile(new URL('../supabase/migrations/20261022140000_fix_group_archive_transaction.sql', import.meta.url), 'utf8');

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
  assert.ok(archiveFix.indexOf("DELETE FROM public.group_invitations") < archiveFix.indexOf("UPDATE public.groups SET archived_at"));
});

test('archiving cancels pending invitations before the read-only guard takes effect', async () => {
  const db = new PGlite();
  const [owner, invited, group] = [randomUUID(), randomUUID(), randomUUID()];
  try {
    await createGroupDatabase(db);
    await db.exec(`
      ALTER TABLE groups ADD COLUMN archived_at timestamptz;
      CREATE FUNCTION test_archived_invitation_guard() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
        IF EXISTS(SELECT 1 FROM public.groups WHERE id=OLD.group_id AND archived_at IS NOT NULL) THEN RAISE EXCEPTION 'Grupo archivado'; END IF;
        RETURN OLD;
      END$$;
      CREATE TRIGGER archived_invitation_guard BEFORE DELETE ON group_invitations FOR EACH ROW EXECUTE FUNCTION test_archived_invitation_guard();
    `);
    await db.exec(archiveFix);
    await db.query('INSERT INTO auth.users VALUES($1),($2)', [owner, invited]);
    await db.query('INSERT INTO groups(id,user_auth_id) VALUES($1,$2)', [group, owner]);
    await db.query("INSERT INTO group_invitations(group_id,invited_user_id,invited_by,status) VALUES($1,$2,$3,'pending')", [group, invited, owner]);
    await db.query("SELECT set_config('request.uid',$1,false)", [owner]);
    await db.exec('SET ROLE authenticated');
    await db.query('SELECT archive_owned_group($1)', [group]);
    await db.exec('RESET ROLE');
    assert.equal((await db.query('SELECT count(*)::int count FROM group_invitations WHERE group_id=$1', [group])).rows[0].count, 0);
    assert.ok((await db.query('SELECT archived_at FROM groups WHERE id=$1', [group])).rows[0].archived_at);
  } finally { await db.close(); }
});
