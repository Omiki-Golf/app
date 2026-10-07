import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL(
  '../supabase/migrations/20261007110000_express_stats_by_code.sql',
  import.meta.url,
), 'utf8');

test('Express statistics code returns only completed or archived non-withdrawn quick rounds', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE golf_courses(id uuid PRIMARY KEY, name text, description text, created_at timestamptz DEFAULT now());
      CREATE TABLE golf_holes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_id uuid, hole_number int, par int, stroke_index int, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
      CREATE TABLE golf_rounds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_id uuid, user_id text, group_id uuid, num_holes int, holes_range text, use_slope boolean, game_mode text, status text, reference_number int, access_code text, created_at timestamptz DEFAULT now(), completed_at timestamptz, admin_withdrawn_at timestamptz);
      CREATE TABLE round_players(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), round_id uuid, name text, created_at timestamptz DEFAULT now());
      CREATE TABLE round_scores(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), round_id uuid, player_id uuid, hole_number int);
    `);
    await db.exec(migration);
    const course = '10000000-0000-4000-8000-000000000001';
    await db.query("INSERT INTO golf_courses(id,name) VALUES($1,'Campo')", [course]);
    await db.query("INSERT INTO golf_holes(course_id,hole_number,par,stroke_index) VALUES($1,1,4,1)", [course]);
    await db.query("INSERT INTO golf_rounds(course_id,user_id,num_holes,use_slope,game_mode,status,reference_number,access_code,completed_at) VALUES($1,'owner',9,true,'stableford','completed',1,'DONE',now()),($1,'owner',9,true,'stableford','archived',2,'PAST',now()),($1,'owner',9,true,'stableford','active',3,'LIVE',null),($1,'owner',9,true,'stableford','cancelled',4,'CANC',null)", [course]);
    await db.query("INSERT INTO golf_rounds(course_id,user_id,group_id,num_holes,use_slope,game_mode,status,reference_number,access_code,completed_at) VALUES($1,'owner',gen_random_uuid(),9,true,'stableford','completed',5,'TEAM',now())", [course]);
    await db.query("INSERT INTO golf_rounds(course_id,user_id,num_holes,use_slope,game_mode,status,reference_number,access_code,completed_at,admin_withdrawn_at) VALUES($1,'owner',9,true,'stableford','completed',6,'GONE',now(),now()),($1,'owner',9,true,'stableford','deleted',7,'DEAD',now(),null)", [course]);

    const completed = (await db.query("SELECT get_express_round_statistics_by_code('done') AS data")).rows[0].data;
    const archived = (await db.query("SELECT get_express_round_statistics_by_code('PAST') AS data")).rows[0].data;
    assert.equal(completed.round.status, 'completed');
    assert.equal(completed.course.name, 'Campo');
    assert.equal(completed.accessMode, 'code');
    assert.equal(archived.round.status, 'archived');
    for (const code of ['LIVE', 'CANC', 'TEAM', 'GONE', 'DEAD', 'UNKNOWN', '']) {
      assert.equal((await db.query('SELECT get_express_round_statistics_by_code($1) AS data', [code])).rows[0].data, null);
    }
  } finally {
    await db.close();
  }
});
