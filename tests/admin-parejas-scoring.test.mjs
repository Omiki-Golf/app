import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { calculateParejasPoints, checkParejasStatus } from '../src/utils/calculations.ts';

const teams = { a: 0, b: 0, c: 1, d: 1 };
const hole = (a, b, c, d) => [
  ['a', a], ['b', b], ['c', c], ['d', d],
].map(([playerId, net]) => ({
  playerId,
  netStrokes: net === 'raya' ? 999 : net,
  abandoned: net === 'raya',
}));
const points = (scores) => [
  calculateParejasPoints('a', scores, teams),
  calculateParejasPoints('c', scores, teams),
];

test('best ball wins 1 point and worst ball wins 0.5', () => {
  assert.deepEqual(points(hole(3, 4, 4, 5)), [1.5, 0]);
  assert.deepEqual(points(hole(3, 6, 4, 5)), [1, 0.5]);
  assert.deepEqual(points(hole(5, 6, 4, 5)), [0, 1.5]);
});

test('a tie on either ball scores nothing for that ball', () => {
  // Hoyo 1 de la partida del 16/10: 4-4 contra 4-5 netos.
  assert.deepEqual(points(hole(4, 4, 4, 5)), [0.5, 0]);
  assert.deepEqual(points(hole(6, 7, 7, 7)), [1, 0]);
  assert.deepEqual(points(hole(4, 5, 4, 5)), [0, 0]);
});

test('a raya counts as the worst ball and four rayas score nothing', () => {
  assert.deepEqual(points(hole(4, 'raya', 5, 6)), [1, 0.5]);
  assert.deepEqual(points(hole(4, 'raya', 4, 'raya')), [0, 0]);
  assert.deepEqual(points(hole('raya', 'raya', 'raya', 'raya')), [0, 0]);
});

test('no points until all four players have entered the hole', () => {
  const scores = hole(3, 4, 5, 6);
  scores[3].entered = false;
  assert.deepEqual(points(scores), [0, 0]);
});

const players = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase() }));
const roundsWith = (holePoints) => new Map(players.map((player, index) => [player.id, {
  scores: Object.fromEntries(holePoints.map(([team0, team1], i) => [i + 1, {
    gross_strokes: 4,
    mode_points: index < 2 ? team0 : team1,
  }])),
}]));
const nineHoles = Array.from({ length: 9 }, (_, i) => ({ hole_number: i + 1 }));

test('the handshake allows at most 1.5 points per remaining hole', () => {
  // 6 hoyos a 1,5 - 0: ventaja 9 con 3 hoyos (4,5 puntos) por jugar.
  const decided = checkParejasStatus(roundsWith(Array(6).fill([1.5, 0])), players, nineHoles);
  assert.equal(decided.isFinished, true);
  assert.equal(decided.leaderName, 'A / B');

  // 4 hoyos a 1,5 - 0: ventaja 6 con 5 hoyos (7,5 puntos) por jugar.
  const open = checkParejasStatus(roundsWith(Array(4).fill([1.5, 0])), players, nineHoles);
  assert.equal(open.isFinished, false);
});

const migrations = await Promise.all([
  '../supabase/migrations/20261008100000_frozen_handshake_result.sql',
  '../supabase/migrations/20261019100000_parejas_best_worst_ball_scoring.sql',
].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));

test('the frozen Parejas result uses 1.5 points per remaining hole', async () => {
  const db = new PGlite();
  try {
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
    for (const migration of migrations) await db.exec(migration);

    const roundId = (await db.query(
      "INSERT INTO golf_rounds(num_holes,game_mode) VALUES(9,'parejas') RETURNING id",
    )).rows[0].id;
    const playerIds = [];
    for (let index = 0; index < 4; index++) {
      playerIds.push((await db.query(
        'INSERT INTO round_players(round_id,name,created_at) VALUES($1,$2,now() + $3 * interval \'1 second\') RETURNING id',
        [roundId, `Jugador ${index + 1}`, index],
      )).rows[0].id);
    }
    const playHole = (holeNumber) => db.query(
      `INSERT INTO round_scores(round_id,player_id,hole_number,gross_strokes,mode_points)
       VALUES($1,$2,$6,4,1.5),($1,$3,$6,4,1.5),($1,$4,$6,5,0),($1,$5,$6,5,0)`,
      [roundId, ...playerIds, holeNumber],
    );
    const decide = async () => (await db.query('SELECT record_round_decision($1) AS result', [roundId])).rows[0].result;

    // Tras 5 hoyos: ventaja 7,5 con 4 hoyos (6 puntos) por jugar. Con el
    // máximo antiguo de 2 por hoyo (8 puntos) aún no estaría decidida.
    for (let holeNumber = 1; holeNumber <= 4; holeNumber++) await playHole(holeNumber);
    assert.equal(await decide(), null);
    await playHole(5);
    const decided = await decide();
    assert.equal(decided.display_text, '7.5&4');
    assert.deepEqual(decided.winner_player_ids, playerIds.slice(0, 2));
  } finally {
    await db.close();
  }
});
