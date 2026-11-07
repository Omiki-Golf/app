import test from 'node:test';
import assert from 'node:assert/strict';
import { personalHandicapChange, profileHandicapForHoles } from '../src/utils/personalHandicap.ts';

test('personal handicap: 9 holes updates 18 with double and celebrates a decrease', () => {
  const result = personalHandicapChange(22, 8, 9);
  assert.equal(result.handicap9, 8);
  assert.equal(result.handicap18, 16);
  assert.match(result.message, /Enhorabuena/);
});

test('personal handicap: odd 18-hole values round 9 upwards and explain an increase', () => {
  const result = personalHandicapChange(16, 19, 18);
  assert.equal(result.handicap18, 19);
  assert.equal(result.handicap9, 10);
  assert.match(result.message, /más holgado/);
});

test('personal handicap: rejects decimals, non-finite numbers and out-of-range values', () => {
  for (const value of [1.5, NaN, Infinity, -1, 28]) {
    assert.throws(() => personalHandicapChange(18, value, 9));
  }
  assert.throws(() => personalHandicapChange(18, 55, 18));
  assert.equal(personalHandicapChange(18, 0, 18).handicap9, 0);
  assert.equal(personalHandicapChange(18, 27, 9).handicap18, 54);
});

test('personal handicap: simply adding yourself does not change an odd profile or show a message', () => {
  assert.equal(profileHandicapForHoles(17, 9), 9);
  assert.deepEqual(personalHandicapChange(17, 9, 9), { handicap18: 17, handicap9: 9, message: '' });
});
