import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCareerStats, findAccountPlayer } from '../src/utils/careerStats.ts';

const account = { userId: 'acc-1', nick: 'FedePlayer', displayName: 'Federico Baeza' };
const round = (id, extra = {}) => ({ id, created_at: `2026-10-0${id.slice(-1)}T10:00:00Z`, game_mode: 'stableford', num_holes: 9, course_id: 'c1', ...extra });
const player = (id, round_id, name, extra = {}) => ({ id, round_id, name, playing_handicap: 10, user_id: null, ...extra });
const holes = (round_id, player_id, points, gross = 5) =>
  points.map(stableford_points => ({ round_id, player_id, gross_strokes: gross, stableford_points, mode_points: 0 }));

test('the account player is found by link first and then by nick or name', () => {
  const linked = [player('p1', 'r1', 'Otro', { user_id: 'acc-1' }), player('p2', 'r1', 'FedePlayer')];
  assert.equal(findAccountPlayer(linked, account)?.id, 'p1');
  assert.equal(findAccountPlayer([player('p3', 'r2', 'Federico Baeza')], account)?.id, 'p3', 'display name');
  assert.equal(findAccountPlayer([player('p4', 'r3', ' fedeplayer ')], account)?.id, 'p4', 'case and spaces');
  assert.equal(findAccountPlayer([player('p5', 'r4', 'FedePlayer'), player('p6', 'r4', 'FedePlayer')], account), null, 'ambiguous names are not guessed');
  assert.equal(findAccountPlayer([player('p7', 'r5', 'Ana')], account), null);
});

test('career totals only count rounds where the account played', () => {
  const rounds = [round('r1'), round('r2'), round('r3')];
  const players = [
    player('me1', 'r1', 'FedePlayer'), player('ana1', 'r1', 'Ana', { playing_handicap: 5 }),
    player('me2', 'r2', 'x', { user_id: 'acc-1' }), player('ana2', 'r2', 'Ana'),
    player('ana3', 'r3', 'Ana'),
  ];
  const scores = [
    ...holes('r1', 'me1', [2, 3, 1]), ...holes('r1', 'ana1', [1, 1, 1]),
    ...holes('r2', 'me2', [0, 4, 2], 1), ...holes('r2', 'ana2', [2, 2, 2]),
    ...holes('r3', 'ana3', [2, 2, 2]),
  ];
  const stats = computeCareerStats(account, rounds, players, scores, { c1: 'Golf Test' });

  assert.equal(stats.roundsPlayed, 2);
  assert.equal(stats.roundsUnidentified, 1, 'r3 has no account player');
  assert.equal(stats.holesPlayed, 6);
  // r1: 6 puntos contra 3 (gana). r2: empate a 6 con el mismo hándicap: no cuenta como victoria segura.
  assert.equal(stats.wins, 1);
  assert.deepEqual(stats.distribution, { eagleOrBetter: 1, birdie: 1, par: 2, bogey: 1, doubleOrWorse: 1 });
  assert.equal(stats.holeInOnes, 3, 'gross 1 on every hole of r2');
  assert.equal(stats.stablefordPer18, 36);
  assert.deepEqual(stats.topCourses, [{ name: 'Golf Test', rounds: 2 }]);
  assert.equal(stats.recent[0].roundId, 'r2', 'most recent first');
});

test('ties go to the lower handicap and frozen decisions win over totals', () => {
  const rounds = [round('r1'), round('r2', { game_mode: 'match', decided_result: { winner_player_ids: ['me2'] } })];
  const players = [
    player('me1', 'r1', 'FedePlayer', { playing_handicap: 8 }), player('ana1', 'r1', 'Ana', { playing_handicap: 12 }),
    player('me2', 'r2', 'FedePlayer'), player('ana2', 'r2', 'Ana'),
  ];
  const scores = [
    ...holes('r1', 'me1', [2, 2]), ...holes('r1', 'ana1', [2, 2]),
    { round_id: 'r2', player_id: 'ana2', gross_strokes: 4, stableford_points: 2, mode_points: 1 },
    { round_id: 'r2', player_id: 'me2', gross_strokes: 5, stableford_points: 1, mode_points: 0 },
  ];
  const stats = computeCareerStats(account, rounds, players, scores, {});
  assert.equal(stats.wins, 2);
  assert.deepEqual(stats.byMode, { stableford: 1, match: 1, sindicato: 0, parejas: 0 });
});
