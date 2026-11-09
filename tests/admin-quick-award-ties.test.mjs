import test from 'node:test';
import assert from 'node:assert/strict';
import { tiedAwardLeaders } from '../src/utils/awardTies.ts';

const players = [
  { name: 'Alberto', birdies: 3, worst: 0 },
  { name: 'Bruno', birdies: 3, worst: 0 },
  { name: 'Cesar', birdies: 3, worst: 1 },
];

test('award cards include every player tied for the maximum', () => {
  assert.deepEqual(tiedAwardLeaders(players, player => player.birdies).map(player => player.name), [
    'Alberto', 'Bruno', 'Cesar',
  ]);
});

test('best and worst hole awards include every player tied for the minimum', () => {
  assert.deepEqual(tiedAwardLeaders(players, player => player.worst, 'min').map(player => player.name), [
    'Alberto', 'Bruno',
  ]);
});
