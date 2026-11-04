import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCareerStats, findAccountPlayer, findLatestPlayingHandicap } from '../src/utils/careerStats.ts';

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

test('cumulative stats: podiums, 9/18 averages, courses split by holes, net results with triples and moments', () => {
  const holePars = [
    ...[1, 2, 3].map(hole_number => ({ course_id: 'c1', hole_number, par: 4 })),
    ...[1, 2, 3].map(hole_number => ({ course_id: 'c2', hole_number, par: 3 })),
  ];
  const rounds = [
    round('r1', { num_holes: 9, course_id: 'c1', created_at: '2026-10-01T10:00:00Z' }),
    round('r2', { num_holes: 18, course_id: 'c1', created_at: '2026-10-02T10:00:00Z' }),
    round('r3', { num_holes: 9, course_id: 'c2', created_at: '2026-10-03T10:00:00Z' }),
  ];
  const players = [
    player('me1', 'r1', 'FedePlayer', { playing_handicap: 10 }), player('ana1', 'r1', 'Ana', { playing_handicap: 5 }),
    player('me2', 'r2', 'FedePlayer', { playing_handicap: 12 }), player('ana2', 'r2', 'Ana', { playing_handicap: 5 }),
    player('me3', 'r3', 'FedePlayer', { playing_handicap: 8 }), player('ana3', 'r3', 'Ana'), player('bob3', 'r3', 'Bob'), player('cy3', 'r3', 'Cy'),
  ];
  const hole = (round_id, player_id, hole_number, gross_strokes, net_strokes, stableford_points) =>
    ({ round_id, player_id, hole_number, gross_strokes, net_strokes, stableford_points, mode_points: 0 });
  const scores = [
    hole('r1', 'me1', 1, 4, 3, 3), hole('r1', 'me1', 2, 7, 7, 0), hole('r1', 'me1', 3, 5, 5, 1), // birdie, triple, bogey: 4 pts
    ...holes('r1', 'ana1', [2, 2, 2]),
    hole('r2', 'me2', 1, 4, 4, 2), hole('r2', 'me2', 2, 6, 6, 0), // par y doble: 2 pts
    ...holes('r2', 'ana2', [1, 0]),
    hole('r3', 'me3', 1, 1, 1, 4), // hoyo en uno en un par 3: eagle neto
    ...holes('r3', 'ana3', [6]), ...holes('r3', 'bob3', [5]), ...holes('r3', 'cy3', [1]),
  ];
  const stats = computeCareerStats(account, rounds, players, scores, { c1: 'La Coma', c2: 'Costa Azahar' }, holePars);

  assert.deepEqual(stats.podiums, [1, 1, 1, 0], 'won r2, second in r1, third in r3');
  assert.deepEqual(stats.stableford9, { rounds: 2, average: 4 });
  assert.deepEqual(stats.stableford18, { rounds: 1, average: 2 });
  assert.deepEqual(stats.courses.map(course => [course.courseName, course.numHoles, course.rounds, course.best, course.worst, course.average]),
    [['Costa Azahar', 9, 1, 4, 4, 4], ['La Coma', 9, 1, 4, 4, 4], ['La Coma', 18, 1, 2, 2, 2]]);
  assert.deepEqual(stats.mostPlayedCourse, { name: 'La Coma', rounds: 2 });
  assert.deepEqual(stats.results, { eagle: 1, birdie: 1, par: 1, bogey: 1, double: 1, triplePlus: 1 });
  assert.equal(stats.resultHoles, 6);
  assert.equal(stats.birdiesPerRound, 0.3);
  assert.equal(stats.bogeysPlusPerRound, 1);
  assert.equal(stats.birdieBogeyRatio, 0.67, 'eagle + birdie against bogey, double and triple');
  assert.equal(stats.bestRound?.roundId, 'r3');
  assert.equal(stats.worstRound?.roundId, 'r2');
  assert.deepEqual([stats.bestHole?.courseName, stats.bestHole?.holeNumber, stats.bestHole?.points], ['Costa Azahar', 1, 4]);
  assert.deepEqual([stats.worstHole?.courseName, stats.worstHole?.holeNumber, stats.worstHole?.grossStrokes], ['La Coma', 2, 7], 'the triple beats the double as worst hole');
  assert.deepEqual(stats.trend.map(item => [item.roundId, item.handicap18]), [['r1', 20], ['r2', 12], ['r3', 16]], '9-hole playing handicap doubled');
  assert.deepEqual([stats.recent[0].roundId, stats.recent[0].position, stats.recent[0].totalPlayers], ['r3', 3, 4]);
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

test('findLatestPlayingHandicap returns 9h and 18h playing handicap from the newest round across any mode', () => {
  // r1: older 18-hole round with playing handicap 16
  // r2: newest 9-hole round with playing handicap 7
  const rounds = [
    round('r1', { created_at: '2026-10-01T10:00:00Z', num_holes: 18, game_mode: 'parejas' }),
    round('r2', { created_at: '2026-10-05T10:00:00Z', num_holes: 9, game_mode: 'match' }),
  ];
  const players = [
    player('p1', 'r1', 'FedePlayer', { playing_handicap: 16 }),
    player('p2', 'r2', 'FedePlayer', { playing_handicap: 7 }),
  ];

  // Latest round is r2 (9 holes, playing_handicap: 7) -> 9h is 7, 18h is 14
  const latest = findLatestPlayingHandicap(account, rounds, players);
  assert.deepEqual(latest, { handicap9: 7, handicap18: 14 });

  // If latest round is 18 holes (playing_handicap: 16) -> 18h is 16, 9h is 8
  const latest18 = findLatestPlayingHandicap(account, [rounds[0]], [players[0]]);
  assert.deepEqual(latest18, { handicap9: 8, handicap18: 16 });

  // If no rounds played
  assert.equal(findLatestPlayingHandicap(account, [], []), null);
});
