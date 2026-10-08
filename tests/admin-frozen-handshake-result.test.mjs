import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL(
  '../supabase/migrations/20261008100000_frozen_handshake_result.sql',
  import.meta.url,
), 'utf8');

const setup = async (mode, players = 2, holes = 9) => {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE golf_rounds(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), num_holes integer NOT NULL,
      status text NOT NULL DEFAULT 'active', game_mode text NOT NULL,
      decided_result jsonb, decided_at timestamptz, updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE round_players(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), round_id uuid NOT NULL REFERENCES golf_rounds(id),
      name text NOT NULL, playing_handicap integer NOT NULL DEFAULT 0, created_at timestamptz DEFAULT now()
    );
    CREATE TABLE round_scores(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), round_id uuid NOT NULL REFERENCES golf_rounds(id),
      player_id uuid NOT NULL REFERENCES round_players(id), hole_number integer NOT NULL,
      gross_strokes integer NOT NULL, abandoned boolean DEFAULT false, mode_points numeric DEFAULT 0,
      UNIQUE(round_id, player_id, hole_number)
    );
    CREATE TABLE archived_rounds(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
  `);
  await db.exec(migration);
  const inserted = await db.query(
    'INSERT INTO golf_rounds(num_holes,game_mode) VALUES($1,$2) RETURNING id', [holes, mode],
  );
  const roundId = inserted.rows[0].id;
  const playerIds = [];
  for (let index = 0; index < players; index++) {
    const player = await db.query(
      'INSERT INTO round_players(round_id,name,created_at) VALUES($1,$2,now() + $3 * interval \'1 second\') RETURNING id',
      [roundId, `Jugador ${index + 1}`, index],
    );
    playerIds.push(player.rows[0].id);
  }
  return { db, roundId, playerIds };
};

test('freezes the first Match Play result and ignores later holes', async () => {
  const { db, roundId, playerIds } = await setup('match');
  try {
    for (let hole = 1; hole <= 5; hole++) {
      await db.query(
        'INSERT INTO round_scores(round_id,player_id,hole_number,gross_strokes,mode_points) VALUES($1,$2,$3,4,1),($1,$4,$3,5,0)',
        [roundId, playerIds[0], hole, playerIds[1]],
      );
    }
    const decided = (await db.query('SELECT record_round_decision($1) AS result', [roundId])).rows[0].result;
    assert.equal(decided.display_text, '5&4');
    assert.deepEqual(decided.winner_player_ids, [playerIds[0]]);

    await db.query(
      'INSERT INTO round_scores(round_id,player_id,hole_number,gross_strokes,mode_points) VALUES($1,$2,6,5,0),($1,$3,6,4,1)',
      [roundId, playerIds[0], playerIds[1]],
    );
    const frozen = (await db.query('SELECT record_round_decision($1) AS result', [roundId])).rows[0].result;
    assert.deepEqual(frozen, decided);
  } finally {
    await db.close();
  }
});

test('completion is rejected until every score exists, with a raya accepted', async () => {
  const { db, roundId, playerIds } = await setup('match', 2, 2);
  try {
    await db.query(
      'INSERT INTO round_scores(round_id,player_id,hole_number,gross_strokes,mode_points) VALUES($1,$2,1,4,1),($1,$3,1,5,0),($1,$2,2,4,1)',
      [roundId, playerIds[0], playerIds[1]],
    );
    await assert.rejects(
      db.query("UPDATE golf_rounds SET status='completed' WHERE id=$1", [roundId]),
      /faltan golpes por informar/,
    );
    await db.query(
      'INSERT INTO round_scores(round_id,player_id,hole_number,gross_strokes,abandoned) VALUES($1,$2,2,0,true)',
      [roundId, playerIds[1]],
    );
    await db.query("UPDATE golf_rounds SET status='completed' WHERE id=$1", [roundId]);
    assert.equal((await db.query('SELECT status FROM golf_rounds WHERE id=$1', [roundId])).rows[0].status, 'completed');
  } finally {
    await db.close();
  }
});

test('freezes Parejas with both winners and the match-style margin', async () => {
  const { db, roundId, playerIds } = await setup('parejas', 4, 9);
  try {
    for (let hole = 1; hole <= 7; hole++) {
      const winning = hole <= 5 ? 2 : 1;
      const losing = hole <= 5 ? 0 : 1;
      await db.query(
        `INSERT INTO round_scores(round_id,player_id,hole_number,gross_strokes,mode_points)
         VALUES($1,$2,$6,4,$7),($1,$3,$6,4,$7),($1,$4,$6,5,$8),($1,$5,$6,5,$8)`,
        [roundId, playerIds[0], playerIds[1], playerIds[2], playerIds[3], hole, winning, losing],
      );
    }
    const decided = (await db.query('SELECT record_round_decision($1) AS result', [roundId])).rows[0].result;
    assert.equal(decided.display_text, '10&2');
    assert.deepEqual(decided.winner_player_ids, playerIds.slice(0, 2));
    assert.equal(decided.winner_label, 'Jugador 1 / Jugador 2');
  } finally {
    await db.close();
  }
});

test('freezes Sindicato only when the lead cannot be caught', async () => {
  const { db, roundId, playerIds } = await setup('sindicato', 3, 9);
  try {
    for (let hole = 1; hole <= 8; hole++) {
      await db.query(
        `INSERT INTO round_scores(round_id,player_id,hole_number,gross_strokes,mode_points)
         VALUES($1,$2,$5,4,4),($1,$3,$5,5,2),($1,$4,$5,6,0)`,
        [roundId, playerIds[0], playerIds[1], playerIds[2], hole],
      );
    }
    const decided = (await db.query('SELECT record_round_decision($1) AS result', [roundId])).rows[0].result;
    assert.equal(decided.display_text, '16 puntos de ventaja · 1 por jugar');
    assert.deepEqual(decided.winner_player_ids, [playerIds[0]]);
  } finally {
    await db.close();
  }
});
