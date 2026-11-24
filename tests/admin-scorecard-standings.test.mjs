import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = () => readFile(new URL('../src/components/Scorecard.tsx', import.meta.url), 'utf8');

test('standings rows use a smaller medal and the same size for points and Actual', async () => {
  const source = await read();
  assert.match(source, /flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base/);
  assert.match(source, /const valueBox = 'rounded-full px-3 py-0\.5 text-lg font-black leading-tight tabular-nums';/);
  assert.match(source, /<span className=\{`\$\{valueBox\} bg-emerald-300 text-emerald-950`\}>\{entry\.points\} pts<\/span>/);
  assert.match(source, /<span className=\{`\$\{valueBox\} \$\{toParClass\}`\}/);
});

test('group cards show the general group standings only with more than one card today', async () => {
  const source = await read();
  assert.match(source, /if \(!groupId \|\| groupDayRounds\.length < 2\) return null;/);
  assert.match(source, /Clasificación general del grupo/);
  assert.match(source, /sameLocalDay\(round\.created_at\)/);
  // La tarjeta propia usa sus datos en vivo.
  assert.match(source, /mine\s*\? Object\.values\(roundsMap\.get\(player\.id\)\?\.scores \?\? \{\}\)/);
});

test('the header compacts after the first stroke and keeps the access code in the green bar', async () => {
  const source = await read();
  assert.match(source, /const hasStartedScoring = rounds\.some\(round => Object\.values\(round\.scores\)\.some\(score => \(score\?\.gross_strokes \?\? 0\) > 0\)\);/);
  assert.match(source, /<h1 className=\{hasStartedScoring \? 'sr-only' :/);
  assert.match(source, /\{hasStartedScoring && accessCode && hasEditAccess && \(/);
  assert.match(source, /\{!hasStartedScoring && accessCode && hasEditAccess && \(/);
});

test('gamification sections show only marked players and hide when nobody is marked', async () => {
  const source = await read();
  assert.doesNotMatch(source, /Ninguno/);
  assert.match(source, /\.filter\(item => item\.noPasoRojasHoles\.length > 0\)/);
  assert.match(source, /if \(!marked\.length\) return null;/);
  assert.match(source, /\.filter\(section => section\.marked\.length > 0\);\s*if \(!visible\.length\) return null;/);
});
