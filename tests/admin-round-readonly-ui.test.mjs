import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const scorecard = await readFile(new URL('../src/components/Scorecard.tsx', import.meta.url), 'utf8');
const roster = await readFile(new URL('../src/components/GroupMemberList.tsx', import.meta.url), 'utf8');
const activeRounds = await readFile(new URL('../src/components/ActiveRoundsViewer.tsx', import.meta.url), 'utf8');
const quickStats = await readFile(new URL('../src/components/QuickPlayStatistics.tsx', import.meta.url), 'utf8');

test('score editing needs the creator or the round code, never the public row', () => {
  assert.doesNotMatch(app, /isCreator \|\| storedCode === roundData\.round\.access_code/);
  assert.match(app, /const hasEditAccess = canEditRoundScores\(isCreator, roundData\.round\.status, accessCodeStorage\.hasAccessCode\(activeRoundId\)\)/);
  assert.match(app, /if \(!roundState\.round \|\| !roundState\.hasEditAccess \|\| readOnly\)/);
  assert.match(scorecard, /readonly=\{!hasEditAccess\}/);
});

test('finish button is concise and member names use a middle ellipsis on mobile', () => {
  assert.match(scorecard, />\s*Finalizar\s*</);
  assert.doesNotMatch(scorecard, /Finalizar Partida/);
  assert.match(roster, /middleEllipsis/);
  assert.match(roster, /sm:hidden/);
});

test('accepted quick-round participants get results without creator actions', () => {
  assert.match(activeRounds, /const isRoundCreator = isVerifiedLocalRoundCreator\(roundStats\.round\.user_id\)/);
  assert.match(activeRounds, /onViewResults\(roundStats\.round\.id\)/);
  assert.match(activeRounds, /!currentGroup && \(isRoundCreator \|\| isLinkedGuest\) && \(/);
  assert.match(activeRounds, /isLinkedGuest \? 'Descartar' : 'Eliminar'/);
  assert.match(activeRounds, /\(currentGroup \|\| isRoundCreator\) && \(/);
  assert.match(app, /roundData\.players\.some\(player => player\.user_id === user\.id\)/);
  assert.match(app, /setStatisticsReturnView\('active-rounds'\)/);
  assert.match(app, /roundId=\{statisticsRoundId \?\? roundState\.round\?\.id\}/);
});

test('quick statistics open the requested accepted round and let linked players dismiss instead of delete', () => {
  assert.match(quickStats, /\(\{ onBack, roundId, sharedRoundData = null, messagesButton \}\)/);
  assert.match(quickStats, /roundId && rounds\.some\(round => round\.id === roundId\) \? roundId : rounds\[0\]\.id/);
  assert.match(quickStats, /const isLinkedPlayer = roundData\?\.isCreator === false/);
  assert.match(quickStats, /if \(isLinkedPlayer\) \{\s*await golfService\.dismissQuickRound/);
});
