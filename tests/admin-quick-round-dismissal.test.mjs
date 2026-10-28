import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const consentMigration = await readFile(new URL('../supabase/migrations/20261026100000_quick_round_participation_consent.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261028120000_quick_round_dismissals.sql', import.meta.url), 'utf8');
const service = await readFile(new URL('../src/services/golfService.ts', import.meta.url), 'utf8');
const stats = await readFile(new URL('../src/components/QuickPlayStatistics.tsx', import.meta.url), 'utf8');
const list = await readFile(new URL('../src/components/ActiveRoundsViewer.tsx', import.meta.url), 'utf8');

test('a linked player dismisses another player\'s quick round without deleting it', async () => {
  const db = new PGlite();
  const owner = randomUUID(), guest = randomUUID(), stranger = randomUUID(), readOnly = randomUUID(), round = randomUUID();
  const asUser = async (id) => { await db.exec('RESET ROLE'); await db.query("SELECT set_config('request.uid',$1,false)", [id]); await db.exec('SET ROLE authenticated'); };
  const listed = async () => (await db.query("SELECT id FROM list_my_quick_rounds(ARRAY['completed','archived'])")).rows.map(row => row.id);
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
      CREATE TABLE round_scores(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),round_id uuid REFERENCES golf_rounds(id) ON DELETE CASCADE,player_id uuid,gross_strokes int);
      CREATE TABLE players(id uuid PRIMARY KEY,group_id uuid,auth_user_id uuid,is_guest boolean,exact_handicap numeric,name text);
    `);
    await db.exec(consentMigration);
    await db.exec(migration);
    await db.query('INSERT INTO auth.users VALUES($1),($2),($3),($4)', [owner, guest, stranger, readOnly]);
    await db.query('INSERT INTO app_user_restrictions VALUES($1,true)', [readOnly]);
    await db.query("INSERT INTO golf_rounds(id,user_id,status,num_holes) VALUES($1,$2,'completed',18)", [round, owner]);
    await db.query("INSERT INTO round_players(round_id,user_id,name) VALUES($1,$2,'Creator'),($1,$3,'Guest'),($1,$4,'ReadOnly')", [round, owner, guest, readOnly]);
    await db.query('INSERT INTO round_scores(round_id,gross_strokes) VALUES($1,5)', [round]);

    await asUser(guest);
    assert.deepEqual(await listed(), [round]);
    await db.query('SELECT dismiss_quick_round($1)', [round]);
    await db.query('SELECT dismiss_quick_round($1)', [round]);
    assert.deepEqual(await listed(), []);

    await asUser(owner);
    assert.deepEqual(await listed(), [round]);
    await assert.rejects(db.query('SELECT dismiss_quick_round($1)', [round]), /No puedes descartar/);

    await asUser(stranger);
    await assert.rejects(db.query('SELECT dismiss_quick_round($1)', [round]), /No puedes descartar/);

    await asUser(readOnly);
    await assert.rejects(db.query('SELECT dismiss_quick_round($1)', [round]), /No tienes permiso/);

    await db.exec('RESET ROLE');
    assert.equal((await db.query('SELECT status FROM golf_rounds WHERE id=$1', [round])).rows[0].status, 'completed');
    assert.equal((await db.query('SELECT count(*)::int n FROM round_players WHERE round_id=$1', [round])).rows[0].n, 3);
    assert.equal((await db.query('SELECT count(*)::int n FROM round_scores WHERE round_id=$1', [round])).rows[0].n, 1);
    assert.equal((await db.query('SELECT count(*)::int n FROM quick_round_dismissals')).rows[0].n, 1);
  } finally { await db.close(); }
});

test('linked players see Descartar instead of a creator-only Eliminar', () => {
  assert.match(service, /rpc\('dismiss_quick_round'/);
  assert.match(stats, /dismissQuickRound/);
  assert.match(stats, /'Descartar'/);
  assert.match(list, /dismissQuickRound/);
  assert.match(list, /Descartar partida/);
});
