import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import {
  calculateModePoints,
  checkParejasStatus,
  checkSindicatoStatus,
  isValidParejasPoints,
  isValidSindicatoPoints,
} from '../src/utils/calculations.ts';

const scoresOf = (nets) => Object.entries(nets).map(([playerId, net]) => ({
  playerId,
  netStrokes: net === 'raya' ? 999 : net,
  abandoned: net === 'raya',
}));

const sindicato = (nets, config) => {
  const scores = scoresOf(nets);
  return Object.keys(nets).map((id) => calculateModePoints('sindicato', id, scores, undefined, config));
};

const SIX_FOUR_TWO = { sindicato: [6, 4, 2] };

test('Sindicato 6-4-2: los empatados se reparten los puntos de sus puestos', () => {
  assert.deepEqual(sindicato({ a: 3, b: 4, c: 5 }, SIX_FOUR_TWO), [6, 4, 2]);
  assert.deepEqual(sindicato({ a: 4, b: 4, c: 5 }, SIX_FOUR_TWO), [5, 5, 2]);
  assert.deepEqual(sindicato({ a: 3, b: 5, c: 5 }, SIX_FOUR_TWO), [6, 3, 3]);
  assert.deepEqual(sindicato({ a: 4, b: 4, c: 4 }, SIX_FOUR_TWO), [4, 4, 4]);
  assert.deepEqual(sindicato({ a: 'raya', b: 4, c: 'raya' }, SIX_FOUR_TWO), [3, 6, 3]);
});

test('Sindicato sin configuración conserva el reglamento 4-2-0', () => {
  assert.deepEqual(sindicato({ a: 3, b: 4, c: 5 }, null), [4, 2, 0]);
  assert.deepEqual(sindicato({ a: 4, b: 4, c: 5 }, null), [3, 3, 0]);
  assert.deepEqual(sindicato({ a: 3, b: 5, c: 5 }, null), [4, 1, 1]);
  assert.deepEqual(sindicato({ a: 4, b: 4, c: 4 }, null), [2, 2, 2]);
});

const teams = { a: 0, b: 0, c: 1, d: 1 };
const parejas = (nets, config) => {
  const scores = scoresOf(nets);
  return ['a', 'c'].map((id) => calculateModePoints('parejas', id, scores, teams, config));
};

test('Parejas 1-1: cada comparación de bola vale 1 y los empates no puntúan', () => {
  const config = { parejas: { best: 1, worst: 1 } };
  assert.deepEqual(parejas({ a: 3, b: 4, c: 4, d: 5 }, config), [2, 0]);
  assert.deepEqual(parejas({ a: 3, b: 6, c: 4, d: 5 }, config), [1, 1]);
  assert.deepEqual(parejas({ a: 4, b: 4, c: 4, d: 5 }, config), [1, 0]);
  assert.deepEqual(parejas({ a: 4, b: 5, c: 4, d: 5 }, config), [0, 0]);
});

test('Parejas sin configuración conserva 1 y 0,5', () => {
  assert.deepEqual(parejas({ a: 3, b: 4, c: 4, d: 5 }, null), [1.5, 0]);
});

test('valida los repartos igual que la base de datos', () => {
  assert.equal(isValidSindicatoPoints([6, 4, 2]), true);
  assert.equal(isValidSindicatoPoints([3, 1.5, 0]), true);
  assert.equal(isValidSindicatoPoints([2, 4, 6]), false);
  assert.equal(isValidSindicatoPoints([2, 2, 2]), false);
  assert.equal(isValidSindicatoPoints([6, 4, 1.25]), false);
  assert.equal(isValidSindicatoPoints([6, 4, NaN]), false);
  assert.equal(isValidParejasPoints({ best: 1, worst: 1 }), true);
  assert.equal(isValidParejasPoints({ best: 0, worst: 0 }), false);
  assert.equal(isValidParejasPoints({ best: -1, worst: 2 }), false);
});

const nineHoles = Array.from({ length: 9 }, (_, i) => ({ hole_number: i + 1 }));
const roundsWith = (players, holePoints) => new Map(players.map((player, index) => [player.id, {
  scores: Object.fromEntries(holePoints.map((points, hole) => [hole + 1, {
    gross_strokes: 4,
    mode_points: points[index],
  }])),
}]));

test('el cierre anticipado usa el máximo por hoyo de la configuración', () => {
  const trio = ['a', 'b', 'c'].map((id) => ({ id, name: id.toUpperCase(), playing_handicap: 0 }));
  // 6-4-2: se pueden recuperar 4 puntos por hoyo. Tras 6 hoyos a 6/4/2 la
  // ventaja es 12 con 3 hoyos (12 puntos) por jugar: aún abierta.
  const six = roundsWith(trio, Array(6).fill([6, 4, 2]));
  assert.equal(checkSindicatoStatus(six, trio, nineHoles, SIX_FOUR_TWO).isFinished, false);
  const seven = roundsWith(trio, Array(7).fill([6, 4, 2]));
  assert.equal(checkSindicatoStatus(seven, trio, nineHoles, SIX_FOUR_TWO).isFinished, true);

  const four = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase() }));
  const config = { parejas: { best: 1, worst: 1 } };
  // 1-1: hasta 2 puntos por hoyo. 5 hoyos a 2-0: ventaja 10 con 4 hoyos (8) por jugar.
  const decided = roundsWith(four, Array(5).fill([2, 2, 0, 0]));
  assert.equal(checkParejasStatus(decided, four, nineHoles, config).isFinished, true);
  const open = roundsWith(four, Array(4).fill([2, 2, 0, 0]));
  assert.equal(checkParejasStatus(open, four, nineHoles, config).isFinished, false);
});

const migrations = await Promise.all([
  '../supabase/migrations/20261008100000_frozen_handshake_result.sql',
  '../supabase/migrations/20261019100000_parejas_best_worst_ball_scoring.sql',
  '../supabase/migrations/20261204100000_mode_points_config.sql',
].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));

const setup = async () => {
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
  for (const migration of migrations) await db.exec(migration);
  return db;
};

const createRound = async (db, mode, config, players) => {
  const roundId = (await db.query(
    'INSERT INTO golf_rounds(num_holes,game_mode,mode_points_config) VALUES(9,$1,$2) RETURNING id',
    [mode, config === null ? null : JSON.stringify(config)],
  )).rows[0].id;
  const playerIds = [];
  for (let index = 0; index < players; index++) {
    playerIds.push((await db.query(
      'INSERT INTO round_players(round_id,name,created_at) VALUES($1,$2,now() + $3 * interval \'1 second\') RETURNING id',
      [roundId, `Jugador ${index + 1}`, index],
    )).rows[0].id);
  }
  const playHole = (hole, points) => Promise.all(playerIds.map((id, index) => db.query(
    'INSERT INTO round_scores(round_id,player_id,hole_number,gross_strokes,mode_points) VALUES($1,$2,$3,4,$4)',
    [roundId, id, hole, points[index]],
  )));
  const decide = async () => (await db.query('SELECT record_round_decision($1) AS result', [roundId])).rows[0].result;
  return { playerIds, playHole, decide };
};

test('la decisión en el servidor usa los puntos de la partida', async () => {
  const db = await setup();
  try {
    const sind = await createRound(db, 'sindicato', SIX_FOUR_TWO, 3);
    for (let hole = 1; hole <= 6; hole++) await sind.playHole(hole, [6, 4, 2]);
    assert.equal(await sind.decide(), null);
    await sind.playHole(7, [6, 4, 2]);
    const decided = await sind.decide();
    assert.deepEqual(decided.winner_player_ids, [sind.playerIds[0]]);

    // Sin configuración: 4-2-0 y máximo 4 por hoyo, como antes.
    const legacy = await createRound(db, 'sindicato', null, 3);
    for (let hole = 1; hole <= 6; hole++) await legacy.playHole(hole, [4, 2, 0]);
    assert.equal(await legacy.decide(), null);
    await legacy.playHole(7, [4, 2, 0]);
    assert.notEqual(await legacy.decide(), null);

    const pairs = await createRound(db, 'parejas', { parejas: { best: 1, worst: 1 } }, 4);
    for (let hole = 1; hole <= 4; hole++) await pairs.playHole(hole, [2, 2, 0, 0]);
    assert.equal(await pairs.decide(), null);
    await pairs.playHole(5, [2, 2, 0, 0]);
    assert.equal((await pairs.decide()).display_text, '10&4');
  } finally {
    await db.close();
  }
});

test('la base de datos rechaza repartos no válidos', async () => {
  const db = await setup();
  try {
    for (const config of [
      { sindicato: [2, 4, 6] },
      { sindicato: [6, 4] },
      { sindicato: [6, 4, 1.25] },
      { parejas: { best: 0, worst: 0 } },
      { parejas: { best: 1 } },
      { otro: 1 },
    ]) {
      await assert.rejects(
        db.query("INSERT INTO golf_rounds(num_holes,game_mode,mode_points_config) VALUES(9,'sindicato',$1)", [JSON.stringify(config)]),
        /golf_rounds_mode_points_config_valid/,
      );
    }
  } finally {
    await db.close();
  }
});
