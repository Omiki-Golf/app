import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canEditRoundScores } from '../src/utils/roundEditing.ts';

test('creator can correct completed scores until archiving', () => {
  assert.equal(canEditRoundScores(true, 'active'), true);
  assert.equal(canEditRoundScores(true, 'completed'), true);
  assert.equal(canEditRoundScores(true, 'archived'), false);
});

test('joining by code does not grant creator editing rights', () => {
  for (const status of ['active', 'completed', 'archived']) {
    assert.equal(canEditRoundScores(false, status), false);
  }
});
