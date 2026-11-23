import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const read = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const frozen = await read('20261008100000_frozen_handshake_result.sql');
const locks = await read('20261130100000_decided_round_locks.sql');

const setup = async (holes = 9) => {
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
  await db.exec(frozen);
  await db.exec(locks);
  const roundId = (await db.query(
    "INSERT INTO golf_rounds(num_holes,game_mode) VALUES($1,'match') RETURNING id", [holes],
  )).rows[0].id;
  const playerIds = [];
  for (let index = 0; index < 2; index++) {
    playerIds.push((await db.query(
      "INSERT INTO round_players(round_id,name,created_at) VALUES($1,$2,now() + $3 * interval '1 second') RETURNING id",
      [roundId, `Jugador ${index + 1}`, index],
    )).rows[0].id);
  }
  return { db, roundId, playerIds };
};

// Jugador 1 gana los 5 primeros hoyos de 9: queda decidido 5&4.
const decideAfterFive = async ({ db, roundId, playerIds }) => {
  for (let hole = 1; hole <= 5; hole++) {
    await db.query(
      'INSERT INTO round_scores(round_id,player_id,hole_number,gross_strokes,mode_points) VALUES($1,$2,$3,4,1),($1,$4,$3,5,0)',
      [roundId, playerIds[0], hole, playerIds[1]],
    );
  }
  return (await db.query('SELECT record_round_decision($1) AS result', [roundId])).rows[0].result;
};

test('captures the holes complete when the round is decided', async () => {
  const ctx = await setup();
  try {
    const decided = await decideAfterFive(ctx);
    assert.equal(decided.display_text, '5&4');
    const { decided_holes } = (await ctx.db.query('SELECT decided_holes FROM golf_rounds WHERE id=$1', [ctx.roundId])).rows[0];
    assert.deepEqual(decided_holes, [1, 2, 3, 4, 5]);
    await assert.rejects(
      ctx.db.query("UPDATE golf_rounds SET decided_holes='{1}' WHERE id=$1", [ctx.roundId]),
      /ya están cerrados/,
    );
  } finally {
    await ctx.db.close();
  }
});

test('locks decided holes but keeps the remaining holes open', async () => {
  const ctx = await setup();
  const { db, roundId, playerIds } = ctx;
  try {
    await decideAfterFive(ctx);
    await assert.rejects(
      db.query('UPDATE round_scores SET gross_strokes=3 WHERE round_id=$1 AND hole_number=2', [roundId]),
      /no se puede modificar/,
    );
    await assert.rejects(
      db.query('DELETE FROM round_scores WHERE round_id=$1 AND hole_number=5', [roundId]),
      /no se puede modificar/,
    );
    await db.query(
      'INSERT INTO round_scores(round_id,player_id,hole_number,gross_strokes,mode_points) VALUES($1,$2,6,5,0),($1,$3,6,4,1)',
      [roundId, playerIds[0], playerIds[1]],
    );
    await db.query('UPDATE round_scores SET gross_strokes=6 WHERE round_id=$1 AND hole_number=6 AND player_id=$2', [roundId, playerIds[0]]);
    const count = (await db.query('SELECT count(*)::int AS n FROM round_scores WHERE round_id=$1', [roundId])).rows[0].n;
    assert.equal(count, 12);
  } finally {
    await db.close();
  }
});

test('a decided round can be finished with holes still to play', async () => {
  const ctx = await setup();
  try {
    await decideAfterFive(ctx);
    await ctx.db.query("UPDATE golf_rounds SET status='completed' WHERE id=$1", [ctx.roundId]);
    assert.equal((await ctx.db.query('SELECT status FROM golf_rounds WHERE id=$1', [ctx.roundId])).rows[0].status, 'completed');
  } finally {
    await ctx.db.close();
  }
});

test('an undecided round still needs every score to be finished', async () => {
  const { db, roundId, playerIds } = await setup(2);
  try {
    await db.query(
      'INSERT INTO round_scores(round_id,player_id,hole_number,gross_strokes,mode_points) VALUES($1,$2,1,4,0.5),($1,$3,1,4,0.5)',
      [roundId, playerIds[0], playerIds[1]],
    );
    assert.equal((await db.query('SELECT record_round_decision($1) AS result', [roundId])).rows[0].result, null);
    await assert.rejects(
      db.query("UPDATE golf_rounds SET status='completed' WHERE id=$1", [roundId]),
      /faltan golpes por informar/,
    );
    await db.query('UPDATE round_scores SET gross_strokes=5 WHERE round_id=$1 AND hole_number=1', [roundId]);
  } finally {
    await db.close();
  }
});
