import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../supabase/migrations/20261026100000_quick_round_participation_consent.sql', import.meta.url), 'utf8');
const acceptanceGuardMigration = await readFile(new URL('../supabase/migrations/20261026110000_allow_quick_round_invitation_acceptance.sql', import.meta.url), 'utf8');
const guestPlayersMigration = await readFile(new URL('../supabase/migrations/20260918100000_group_guest_players.sql', import.meta.url), 'utf8');
const setup = await readFile(new URL('../src/components/PlayerSetup.tsx', import.meta.url), 'utf8');
const notifications = await readFile(new URL('../src/components/NotificationsBell.tsx', import.meta.url), 'utf8');
const service = await readFile(new URL('../src/services/golfService.ts', import.meta.url), 'utf8');

test('registered quick-round players require consent and accepted participation appears in history', async () => {
  const db = new PGlite();
  const owner = randomUUID(), invited = randomUUID(), rejected = randomUUID(), round = randomUUID(), secondRound = randomUUID(), course = randomUUID();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.uid',true),'')::uuid$$;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE app_user_restrictions(user_id uuid PRIMARY KEY,read_only boolean);
      CREATE FUNCTION is_app_user_read_only() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT coalesce((SELECT read_only FROM public.app_user_restrictions WHERE user_id=auth.uid()),false)$$;
      CREATE TABLE user_profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid UNIQUE,nick text,display_name text,exact_handicap numeric);
      CREATE TABLE golf_courses(id uuid PRIMARY KEY,name text);
      CREATE TABLE tees(id uuid PRIMARY KEY,slope_18 numeric,slope_9_i numeric,slope_9_ii numeric);
      CREATE TABLE golf_rounds(id uuid PRIMARY KEY,group_id uuid,user_id text,status text,admin_withdrawn_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),completed_at timestamptz,num_holes int,use_slope boolean,manual_slope numeric,holes_range text,tee_id uuid,course_id uuid);
      CREATE TABLE round_players(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),round_id uuid REFERENCES golf_rounds(id) ON DELETE CASCADE,player_id uuid,user_id uuid,name text,exact_handicap numeric,exact_handicap_18 numeric,playing_handicap numeric,is_guest boolean NOT NULL DEFAULT false,created_at timestamptz DEFAULT now());
      CREATE TABLE players(id uuid PRIMARY KEY,group_id uuid,auth_user_id uuid,is_guest boolean,exact_handicap numeric,name text);
      CREATE FUNCTION require_group_result_writer(uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Unexpected group write'; END $$;
    `);
    await db.exec(migration);
    const guestGuard = guestPlayersMigration.match(/CREATE FUNCTION public\.guard_guest_participation\(\) RETURNS trigger[\s\S]*?END \$\$;/)?.[0];
    assert.ok(guestGuard);
    await db.exec(guestGuard);
    await db.exec('CREATE TRIGGER b_guest_participation BEFORE INSERT OR UPDATE OR DELETE ON public.round_players FOR EACH ROW EXECUTE FUNCTION public.guard_guest_participation()');
    await db.exec(acceptanceGuardMigration);
    await db.query('INSERT INTO auth.users VALUES($1),($2),($3)', [owner, invited, rejected]);
    await db.query("INSERT INTO user_profiles(user_id,nick,exact_handicap) VALUES($1,'Creator',18),($2,'Kikeas01',14),($3,'Kikeas02',12)", [owner, invited, rejected]);
    await db.query("INSERT INTO golf_courses VALUES($1,'Costa Azahar')", [course]);
    await db.query("INSERT INTO golf_rounds(id,user_id,status,num_holes,use_slope,course_id) VALUES($1,$2,'active',18,false,$3)", [round, owner, course]);
    await db.query("INSERT INTO golf_rounds(id,user_id,status,num_holes,use_slope,course_id) VALUES($1,$2,'active',18,false,$3)", [secondRound, owner, course]);
    await db.query("SELECT set_config('request.uid',$1,false)", [owner]); await db.exec('SET ROLE authenticated');
    const player = (await db.query('SELECT add_registered_quick_round_player($1,$2) player', [round, invited])).rows[0].player;
    const rejectedPlayer = (await db.query('SELECT add_registered_quick_round_player($1,$2) player', [round, rejected])).rows[0].player;
    const samePlayerInAnotherQuickRound = (await db.query('SELECT add_registered_quick_round_player($1,$2) player', [secondRound, invited])).rows[0].player;
    assert.equal(player.user_id, null);
    assert.equal(player.participation_status, 'pending');
    assert.equal(samePlayerInAnotherQuickRound.participation_status, 'pending');
    await db.exec('RESET ROLE');
    assert.equal((await db.query('SELECT count(*)::int n FROM quick_round_participation_invitations WHERE invited_user_id=$1', [invited])).rows[0].n, 2);
    const invitation = (await db.query('SELECT * FROM quick_round_participation_invitations WHERE round_id=$1 AND invited_user_id=$2', [round, invited])).rows[0];
    await db.query("UPDATE golf_rounds SET status='archived' WHERE id=$1", [round]);
    await db.query("SELECT set_config('request.uid',$1,false)", [invited]); await db.exec('SET ROLE authenticated');
    const invitationRows = (await db.query('SELECT * FROM list_my_quick_round_invitations()')).rows;
    const invitationDetails = invitationRows.map(row => Object.values(row)[0]).find(item => item.id === invitation.id);
    assert.ok(invitationDetails);
    assert.equal(invitationDetails.id, invitation.id);
    assert.equal(invitationDetails.inviter_nick, 'Creator');
    await db.query("SELECT respond_quick_round_invitation($1,'accepted')", [invitation.id]);
    assert.equal((await db.query("SELECT count(*)::int n FROM list_my_quick_rounds(ARRAY['archived'])")).rows[0].n, 1);
    await db.exec('RESET ROLE');
    assert.equal((await db.query('SELECT user_id FROM round_players WHERE id=$1', [player.id])).rows[0].user_id, invited);
    await db.query("SELECT set_config('request.uid',$1,false)", [rejected]); await db.exec('SET ROLE authenticated');
    const rejectedInvitationRow = (await db.query('SELECT * FROM list_my_quick_round_invitations()')).rows[0];
    const rejectedInvitation = Object.values(rejectedInvitationRow)[0];
    await db.query("SELECT respond_quick_round_invitation($1,'rejected')", [rejectedInvitation.id]);
    await db.exec('RESET ROLE');
    assert.equal((await db.query('SELECT user_id FROM round_players WHERE id=$1', [rejectedPlayer.id])).rows[0].user_id, null);
    assert.match(acceptanceGuardMigration, /i\.status='accepted'/);
  } finally { await db.close(); }
});

test('quick-round UI sends invitations and reads accepted participations', () => {
  assert.match(setup, /addRegisteredQuickRoundPlayer/);
  assert.match(setup, /recibirá una invitación para guardar los resultados/);
  assert.match(notifications, /guardar los resultados en Mis partidas y Mis estadísticas/);
  assert.match(service, /list_my_quick_rounds/);
});
