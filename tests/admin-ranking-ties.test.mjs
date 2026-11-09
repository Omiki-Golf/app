import test from 'node:test';
import assert from 'node:assert/strict';
import { sortByResultAndHandicap, competitionPosition } from '../src/utils/ranking.ts';
import { tiedAwardLeaders } from '../src/utils/awardTies.ts';

const players = [
  { name: 'Pepe', hcp: 3, points: 18 },
  { name: 'Perico', hcp: 5, points: 15 },
  { name: 'Jose', hcp: 5, points: 15 },
  { name: 'Fede', hcp: 3, points: 15 },
];

test('classification uses points, then lower handicap, and shares position only when both tie', () => {
  const sorted = sortByResultAndHandicap(players, p => p.points, p => p.hcp);
  assert.deepEqual(sorted.map(p => p.name), ['Pepe', 'Fede', 'Perico', 'Jose']);
  assert.deepEqual(sorted.map((_, index) => competitionPosition(sorted, index, (a, b) => a.points === b.points && a.hcp === b.hcp)), [1, 2, 3, 3]);
});

test('tied positive awards put lower handicap first and negative awards put higher handicap first', () => {
  const tied = players.map(player => ({ ...player, awards: 2 }));
  assert.deepEqual(tiedAwardLeaders(tied, p => p.awards, 'max', p => p.hcp, 'lower').map(p => p.name), ['Pepe', 'Fede', 'Perico', 'Jose']);
  assert.deepEqual(tiedAwardLeaders(tied, p => p.awards, 'max', p => p.hcp, 'higher').map(p => p.name), ['Perico', 'Jose', 'Pepe', 'Fede']);
});
