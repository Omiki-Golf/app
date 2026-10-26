import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const scorecard = await readFile(new URL('../src/components/Scorecard.tsx', import.meta.url), 'utf8');
const roster = await readFile(new URL('../src/components/GroupMemberList.tsx', import.meta.url), 'utf8');

test('only the round creator receives UI write access', () => {
  assert.doesNotMatch(app, /isCreator \|\| storedCode === roundData\.round\.access_code/);
  assert.match(app, /const hasEditAccess = isCreator && roundData\.round\.status === 'active'/);
  assert.match(app, /if \(!roundState\.round \|\| !roundState\.hasEditAccess \|\| readOnly\)/);
  assert.match(scorecard, /readonly=\{!hasEditAccess\}/);
});

test('finish button is concise and member names use a middle ellipsis on mobile', () => {
  assert.match(scorecard, />\s*Finalizar\s*</);
  assert.doesNotMatch(scorecard, /Finalizar Partida/);
  assert.match(roster, /middleEllipsis/);
  assert.match(roster, /sm:hidden/);
});
