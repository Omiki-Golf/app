import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createGroupDatabase } from './helpers/group-database.mjs';

const migration = await readFile(new URL('../supabase/migrations/20261022130000_private_quick_player_suggestions.sql', import.meta.url), 'utf8');
const setup = await readFile(new URL('../src/components/PlayerSetup.tsx', import.meta.url), 'utf8');

test('quick-player suggestions are private, persistent and soft deleted', async () => {
  const db = new PGlite();
  const [owner, other, round] = [randomUUID(), randomUUID(), randomUUID()];
  try {
    await createGroupDatabase(db);
    await db.exec('ALTER TABLE golf_rounds ADD COLUMN created_by uuid; ALTER TABLE golf_rounds ADD COLUMN user_id text;');
    await db.query('INSERT INTO auth.users VALUES($1),($2)', [owner, other]);
    await db.query("INSERT INTO user_profiles(user_id,nick,display_name,exact_handicap) VALUES($1,'Owner','Owner Name',18),($2,'Other','Other Name',12)", [owner, other]);
    await db.query("INSERT INTO golf_rounds(id,group_id,num_holes,use_slope,status,created_by) VALUES($1,NULL,9,false,'completed',$2)", [round, owner]);
    await db.query("INSERT INTO round_players(round_id,name,exact_handicap,exact_handicap_18,playing_handicap) VALUES($1,'Fede',7,7,7)", [round]);
    await db.exec(migration);

    await db.query("SELECT set_config('request.uid',$1,false)", [owner]);
    await db.exec('SET ROLE authenticated');
    let rows = (await db.query('SELECT name,handicap_18 FROM list_my_quick_player_suggestions()')).rows;
    assert.deepEqual(rows, [{ name: 'Fede', handicap_18: '14' }]);
    const suggestion = (await db.query("SELECT (save_my_quick_player_suggestion('Álvaro',20)).id id")).rows[0].id;
    await db.query('SELECT hide_my_quick_player_suggestion($1)', [suggestion]);
    rows = (await db.query('SELECT name FROM list_my_quick_player_suggestions()')).rows;
    assert.deepEqual(rows, [{ name: 'Fede' }]);

    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.uid',$1,false)", [other]);
    await db.exec('SET ROLE authenticated');
    assert.deepEqual((await db.query('SELECT name FROM list_my_quick_player_suggestions()')).rows, []);
  } finally { await db.close(); }
});

test('player search keeps unavailable matches visible and normalizes accents', () => {
  assert.match(setup, /normalize\('NFD'\)/);
  assert.match(setup, /Ya está en esta partida/);
  assert.match(setup, /Está en otra partida activa/);
  assert.match(setup, /saveQuickPlayerSuggestion/);
  assert.match(setup, /hideQuickPlayerSuggestion/);
});
