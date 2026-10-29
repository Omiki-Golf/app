import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../supabase/migrations/20261029110000_code_holder_active_rounds.sql', import.meta.url), 'utf8');
const service = await readFile(new URL('../src/services/golfService.ts', import.meta.url), 'utf8');
const list = await readFile(new URL('../src/components/ActiveRoundsViewer.tsx', import.meta.url), 'utf8');

test('code holders keep active quick rounds in their list until they end', async () => {
  const db = new PGlite();
  const owner = randomUUID(), holder = randomUUID(), stranger = randomUUID();
  const [active, finished, group, withdrawn] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const asUser = async (id) => { await db.exec('RESET ROLE'); await db.query("SELECT set_config('request.uid',$1,false)", [id]); await db.exec('SET ROLE authenticated'); };
  const listed = async () => (await db.query('SELECT id FROM list_my_code_quick_rounds()')).rows.map(row => row.id);
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.uid',true),'')::uuid$$;
      CREATE FUNCTION verified_round_actor() RETURNS text LANGUAGE sql STABLE AS $$SELECT auth.uid()::text$$;
      CREATE TABLE golf_rounds(id uuid PRIMARY KEY,group_id uuid,user_id text,status text,admin_withdrawn_at timestamptz,created_at timestamptz DEFAULT now());
      CREATE TABLE express_round_participants(round_id uuid REFERENCES golf_rounds(id) ON DELETE CASCADE,user_id text,PRIMARY KEY(round_id,user_id));
      REVOKE ALL ON golf_rounds,express_round_participants FROM PUBLIC,anon,authenticated;
    `);
    await db.exec(migration);
    await db.query(`INSERT INTO golf_rounds(id,group_id,user_id,status,admin_withdrawn_at) VALUES
      ($1,NULL,$5,'active',NULL),($2,NULL,$5,'completed',NULL),($3,gen_random_uuid(),$5,'active',NULL),($4,NULL,$5,'active',now())`,
      [active, finished, group, withdrawn, owner]);
    for (const round of [active, finished, group, withdrawn]) {
      await db.query('INSERT INTO express_round_participants VALUES($1,$2)', [round, holder]);
    }

    await asUser(holder);
    assert.deepEqual(await listed(), [active]);
    await assert.rejects(db.query('SELECT * FROM express_round_participants'), /permission denied/);

    await asUser(stranger);
    assert.deepEqual(await listed(), []);
  } finally { await db.close(); }
});

test('the client merges code rounds and invites registered accounts added mid-round', () => {
  assert.match(service, /rpc\('list_my_code_quick_rounds'\)/);
  assert.match(service, /return this\.withCodeQuickRounds\(\(data \|\| \[\]\) as GolfRound\[\]\)/);
  assert.match(list, /await golfService\.addRegisteredQuickRoundPlayer\(roundId, pickedAccount\.user_id\)/);
  assert.match(list, /userService\.searchByNick\(term\)/);
});
