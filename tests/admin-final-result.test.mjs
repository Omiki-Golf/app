import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateFinalResult, isDecidedBeforeLastHole } from '../src/utils/finalResult.ts';

const player = (id, name, playing_handicap) => ({ id, name, playing_handicap });
const scores = (...points) => Object.fromEntries(points.map((mode_points, i) => [i + 1, { mode_points }]));

test('handshake only when the round was decided with holes still to play', () => {
  assert.equal(isDecidedBeforeLastHole(null), false);
  assert.equal(isDecidedBeforeLastHole({ holes_remaining: 0 }), false);
  assert.equal(isDecidedBeforeLastHole({ holes_remaining: 2 }), true);
});

test('match final result reports winner and margin', () => {
  const players = [player('a', 'Ana', 10), player('b', 'Bea', 5)];
  const result = calculateFinalResult('match', players, { a: scores(1, 1, 0), b: scores(0, 0, 0) });
  assert.equal(result.winnerLabel, 'Ana');
  assert.equal(result.resultText, '2 UP');
  assert.equal(result.decidedByHandicap, false);
});

test('match tie is won by the lower handicap', () => {
  const players = [player('a', 'Ana', 10), player('b', 'Bea', 5)];
  const result = calculateFinalResult('match', players, { a: scores(1, 0), b: scores(0, 1) });
  assert.equal(result.winnerLabel, 'Bea');
  assert.equal(result.decidedByHandicap, true);
});

test('sindicato ranks first, second and third with handicap tie-break', () => {
  const players = [player('a', 'Ana', 12), player('b', 'Bea', 8), player('c', 'Carla', 3)];
  const result = calculateFinalResult('sindicato', players, {
    a: scores(4, 2), b: scores(2, 4), c: scores(0, 0),
  });
  assert.deepEqual(result.standings.map((s) => [s.position, s.label]), [[1, 'Bea'], [2, 'Ana'], [3, 'Carla']]);
  assert.equal(result.decidedByHandicap, true);
});

test('parejas counts one member per team and breaks ties by team handicap', () => {
  const players = [player('a', 'Ana', 10), player('b', 'Bea', 10), player('c', 'Carla', 5), player('d', 'Dora', 5)];
  const tie = calculateFinalResult('parejas', players, {
    a: scores(2), b: scores(2), c: scores(2), d: scores(2),
  });
  assert.equal(tie.winnerLabel, 'Carla / Dora');
  assert.equal(tie.decidedByHandicap, true);

  const win = calculateFinalResult('parejas', players, {
    a: scores(2, 2), b: scores(2, 2), c: scores(0, 2), d: scores(0, 2),
  });
  assert.equal(win.winnerLabel, 'Ana / Bea');
  assert.equal(win.resultText, '2 UP');
});
