import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('members can abandon a group while preserving their historical player record', async () => {
  const [migration, groups, service, app, roundSetup] = await Promise.all([
    read('../supabase/migrations/20261116115000_leave_group_and_membership_notifications.sql'),
    read('../src/components/MyGroups.tsx'),
    read('../src/services/userService.ts'),
    read('../src/App.tsx'),
    read('../src/components/RoundSetup.tsx'),
  ]);
  assert.match(service, /rpc\('leave_group_membership'/);
  assert.match(groups, /Abandonar grupo/);
  assert.match(groups, /group\.access !== 'owner'/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.leave_group_membership/);
  assert.match(migration, /El creador no puede abandonar su propio grupo/);
  assert.match(migration, /Tienes una partida activa en este grupo/);
  assert.match(migration, /DELETE FROM public\.group_members/);
  assert.doesNotMatch(migration, /DELETE FROM public\.players/);
  assert.match(migration, /DELETE FROM public\.group_invitations/);
  assert.match(app, /onGroupLeft=/);
  assert.match(roundSetup, /aria-label="Volver al inicio"/);
});

test('voluntary exits and manager removals create best-effort notifications', async () => {
  const [migration, roster] = await Promise.all([
    read('../supabase/migrations/20261116115000_leave_group_and_membership_notifications.sql'),
    read('../src/components/GroupMemberList.tsx'),
  ]);
  assert.match(migration, /AFTER DELETE ON public\.group_members/);
  assert.match(migration, /Has abandonado un grupo/);
  assert.match(migration, /Un jugador ha abandonado el grupo/);
  assert.match(migration, /Te han sacado de un grupo/);
  assert.match(migration, /member\.role='admin'/);
  assert.match(migration, /EXCEPTION WHEN OTHERS THEN/);
  assert.match(roster, /Sacar del grupo/);
  assert.match(roster, /recibirá una notificación/);
});

test('database leave operation keeps history, notifies accounts and blocks active players', async () => {
  const db = new PGlite();
  const migration = await read('../supabase/migrations/20261116115000_leave_group_and_membership_notifications.sql');
  const [owner, admin, member, group, membership, player, round] = Array.from({ length: 7 }, randomUUID);
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.uid',true),'')::uuid$$;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE public.user_profiles(user_id uuid PRIMARY KEY,nick text);
      CREATE TABLE public.groups(id uuid PRIMARY KEY,name text,group_code text,user_auth_id uuid,archived_at timestamptz);
      CREATE TABLE public.group_members(id uuid PRIMARY KEY,group_id uuid,user_id uuid,role text,joined_at timestamptz DEFAULT now());
      CREATE TABLE public.group_write_permits(tx bigint,entity uuid,operation text,PRIMARY KEY(tx,entity,operation));
      CREATE TABLE public.group_invitations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid,invited_user_id uuid,invited_by uuid,status text);
      CREATE TABLE public.players(id uuid PRIMARY KEY,group_id uuid,auth_user_id uuid);
      CREATE TABLE public.golf_rounds(id uuid PRIMARY KEY,group_id uuid,status text);
      CREATE TABLE public.round_players(round_id uuid,player_id uuid);
      CREATE TABLE public.app_messages(id uuid PRIMARY KEY,title text,body text,status text,author_id uuid,author_alias text,recipients jsonb,sent_at timestamptz,sender_kind text,source_group_id uuid,sender_label text,recipient_selection jsonb);
      CREATE TABLE public.app_message_deliveries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),message_id uuid,kind text,recipient_id uuid,recipient_label text);
      CREATE FUNCTION public.is_app_user_read_only() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT false$$;
    `);
    await db.exec(migration);
    await db.query('INSERT INTO auth.users VALUES($1),($2),($3)', [owner, admin, member]);
    await db.query('INSERT INTO user_profiles VALUES($1,$2),($3,$4),($5,$6)', [owner, 'Creador', admin, 'Admin', member, 'Miembro']);
    await db.query('INSERT INTO groups(id,name,group_code,user_auth_id) VALUES($1,$2,$3,$4)', [group, 'Amigos', 'ABC123', owner]);
    await db.query("INSERT INTO group_members VALUES($1,$2,$3,'admin',now()),($4,$2,$5,'admin',now()),($6,$2,$7,'member',now())", [randomUUID(), group, owner, randomUUID(), admin, membership, member]);
    await db.query('INSERT INTO players VALUES($1,$2,$3)', [player, group, member]);
    await db.query("INSERT INTO group_invitations(group_id,invited_user_id,invited_by,status) VALUES($1,$2,$3,'accepted')", [group, member, owner]);
    await db.query("SELECT set_config('request.uid',$1,false)", [member]);
    await db.query('SELECT leave_group_membership($1)', [group]);
    assert.equal((await db.query('SELECT count(*)::int n FROM group_members WHERE id=$1', [membership])).rows[0].n, 0);
    assert.equal((await db.query('SELECT count(*)::int n FROM players WHERE id=$1', [player])).rows[0].n, 1);
    assert.equal((await db.query('SELECT count(*)::int n FROM group_invitations WHERE invited_user_id=$1', [member])).rows[0].n, 0);
    assert.equal((await db.query('SELECT count(*)::int n FROM app_message_deliveries', [])).rows[0].n, 3);

    const secondMembership = randomUUID();
    await db.query("INSERT INTO group_members VALUES($1,$2,$3,'member',now())", [secondMembership, group, member]);
    await db.query("INSERT INTO golf_rounds VALUES($1,$2,'active')", [round, group]);
    await db.query('INSERT INTO round_players VALUES($1,$2)', [round, player]);
    await assert.rejects(db.query('SELECT leave_group_membership($1)', [group]), /partida activa/);
    assert.equal((await db.query('SELECT count(*)::int n FROM group_members WHERE id=$1', [secondMembership])).rows[0].n, 1);
    await db.query("UPDATE golf_rounds SET status='completed' WHERE id=$1", [round]);
    await db.query("SELECT set_config('request.uid',$1,false)", [admin]);
    await db.query('DELETE FROM group_members WHERE id=$1', [secondMembership]);
    assert.equal((await db.query('SELECT count(*)::int n FROM app_message_deliveries WHERE recipient_id=$1', [member])).rows[0].n, 2);
    assert.match((await db.query('SELECT body FROM app_messages ORDER BY sent_at DESC LIMIT 1')).rows[0].body, /te ha sacado del grupo Amigos/);
  } finally {
    await db.close();
  }
});
