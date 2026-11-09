import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../supabase/migrations/20261005130000_round_activity_events.sql', import.meta.url), 'utf8');
const U = '00000000-0000-4000-8000-000000000001';
const OUT = '00000000-0000-4000-8000-000000000002';
const G = '00000000-0000-4000-8000-000000000003';
const QUICK = '00000000-0000-4000-8000-000000000004';
const TEAM = '00000000-0000-4000-8000-000000000005';
const QP = '00000000-0000-4000-8000-000000000006';
const TP = '00000000-0000-4000-8000-000000000007';

test('round activity is idempotent, correctable and scoped to round access or Team membership', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.uid',true),'')::uuid$$;
      CREATE TABLE groups(id uuid PRIMARY KEY,user_auth_id uuid);
      CREATE TABLE group_members(group_id uuid,user_id uuid);
      CREATE TABLE golf_rounds(id uuid PRIMARY KEY,group_id uuid,user_id text,access_code text);
      CREATE TABLE round_players(id uuid PRIMARY KEY,round_id uuid REFERENCES golf_rounds(id),name text);
      CREATE TABLE round_scores(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),round_id uuid REFERENCES golf_rounds(id),player_id uuid REFERENCES round_players(id),hole_number integer,gross_strokes integer,abandoned boolean DEFAULT false,no_paso_rojas boolean DEFAULT false,spanish_hands boolean DEFAULT false);
      INSERT INTO auth.users VALUES('${U}'),('${OUT}');
      INSERT INTO groups VALUES('${G}',NULL);
      INSERT INTO group_members VALUES('${G}','${U}');
      INSERT INTO golf_rounds VALUES('${QUICK}',NULL,'anon_device','1234'),('${TEAM}','${G}','${U}','5678');
      INSERT INTO round_players VALUES('${QP}','${QUICK}','Fede'),('${TP}','${TEAM}','Jose');
      GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;`);
    await db.exec(migration);
    await db.query(`INSERT INTO round_scores(round_id,player_id,hole_number,gross_strokes,no_paso_rojas,spanish_hands) VALUES($1,$2,7,1,true,true)`, [QUICK, QP]);
    assert.equal(Number((await db.query('SELECT count(*) n FROM round_activity_events WHERE round_id=$1',[QUICK])).rows[0].n),3);
    await db.query(`UPDATE round_scores SET gross_strokes=1,no_paso_rojas=true,spanish_hands=true WHERE round_id=$1`,[QUICK]);
    assert.equal(Number((await db.query('SELECT count(*) n FROM round_activity_events WHERE round_id=$1',[QUICK])).rows[0].n),3);

    const as = async (id) => { await db.exec('RESET ROLE'); await db.query("SELECT set_config('request.uid',$1,false)",[id || '']); await db.exec(`SET ROLE ${id ? 'authenticated' : 'anon'}`); };
    await as(null);
    const quick = (await db.query('SELECT round_activity_inbox($1,NULL,$2,NULL,false) d',[QUICK,'1234'])).rows[0].d;
    assert.equal(quick.unread,3);
    await assert.rejects(db.query('SELECT round_activity_inbox($1,NULL,$2,NULL,false)',[QUICK,'9999']),/acceso/);
    await db.exec('RESET ROLE');
    await db.query('UPDATE round_scores SET gross_strokes=2,no_paso_rojas=false WHERE round_id=$1',[QUICK]);
    assert.deepEqual((await db.query('SELECT event_type FROM round_activity_events WHERE round_id=$1',[QUICK])).rows.map(r=>r.event_type),['spanish_hands']);

    await db.query(`INSERT INTO round_scores(round_id,player_id,hole_number,gross_strokes) VALUES($1,$2,3,1)`,[TEAM,TP]);
    await as(U);
    const team = (await db.query('SELECT round_activity_inbox(NULL,$1,NULL,NULL,true) d',[G])).rows[0].d;
    assert.equal(team.events.length,1);
    assert.equal(team.unread,1);
    const read = (await db.query('SELECT round_activity_inbox(NULL,$1,NULL,NULL,false) d',[G])).rows[0].d;
    assert.equal(read.unread,0);
    await as(OUT);
    await assert.rejects(db.query('SELECT round_activity_inbox(NULL,$1,NULL,NULL,false)',[G]),/acceso/);
  } finally { await db.close(); }
});

test('Pro-Shop titles marked on a hole create, follow and backfill game activity', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.uid',true),'')::uuid$$;
      CREATE TABLE groups(id uuid PRIMARY KEY,user_auth_id uuid);
      CREATE TABLE group_members(group_id uuid,user_id uuid);
      CREATE TABLE golf_rounds(id uuid PRIMARY KEY,group_id uuid,user_id text,access_code text);
      CREATE TABLE round_players(id uuid PRIMARY KEY,round_id uuid REFERENCES golf_rounds(id),name text);
      CREATE TABLE round_scores(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),round_id uuid REFERENCES golf_rounds(id),player_id uuid REFERENCES round_players(id),hole_number integer,gross_strokes integer,abandoned boolean DEFAULT false,no_paso_rojas boolean DEFAULT false,spanish_hands boolean DEFAULT false,gamification_events text[] NOT NULL DEFAULT '{}',updated_at timestamptz DEFAULT now());
      INSERT INTO groups VALUES('${G}',NULL);
      INSERT INTO golf_rounds VALUES('${TEAM}','${G}','${U}','5678');
      INSERT INTO round_players VALUES('${TP}','${TEAM}','Jose');`);
    await db.exec(migration);
    // Marca hecha antes de la migración: se rellena como aviso.
    await db.query(`INSERT INTO round_scores(round_id,player_id,hole_number,gross_strokes,gamification_events) VALUES($1,$2,2,5,'{minero}')`, [TEAM, TP]);
    await db.exec(await readFile(new URL('../supabase/migrations/20261109160000_gamification_activity_events.sql', import.meta.url), 'utf8'));
    const types = async () => (await db.query('SELECT event_type, hole_number FROM round_activity_events WHERE round_id=$1 ORDER BY hole_number, event_type',[TEAM])).rows.map(r => `${r.event_type}@${r.hole_number}`);
    assert.deepEqual(await types(), ['minero@2']);

    await db.query(`INSERT INTO round_scores(round_id,player_id,hole_number,gross_strokes,spanish_hands,gamification_events) VALUES($1,$2,4,3,true,'{buceador,hada-patos}')`, [TEAM, TP]);
    assert.deepEqual(await types(), ['minero@2', 'buceador@4', 'hada-patos@4', 'spanish_hands@4']);

    // Desmarcar un título quita su aviso; cambiar golpes no duplica.
    await db.query(`UPDATE round_scores SET gamification_events='{hada-patos}', gross_strokes=4 WHERE round_id=$1 AND hole_number=4`, [TEAM]);
    assert.deepEqual(await types(), ['minero@2', 'hada-patos@4', 'spanish_hands@4']);
  } finally { await db.close(); }
});
