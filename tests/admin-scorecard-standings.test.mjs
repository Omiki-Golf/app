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

test('group cards show the general group standings only with more than one card that day', async () => {
  const source = await read();
  assert.match(source, /const groupStandings = groupId && groupDayRounds\.length >= 2/);
  assert.match(source, /Clasificación general del grupo/);
  // El día es el de la partida (también al consultarla otro día) e incluye tarjetas archivadas.
  assert.match(source, /golfService\.getGroupRoundsOfDay\(groupId, roundDate \?\? new Date\(\)\.toISOString\(\)\)/);
  const service = await readFile(new URL('../src/services/golfService.ts', import.meta.url), 'utf8');
  assert.match(service, /async getGroupRoundsOfDay\(groupId: string, dateIso: string\)[\s\S]{0,700}\.in\('status', \['active', 'completed', 'archived'\]\)/);
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /roundDate=\{roundState\.round\.created_at\}/);
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

test('the trophy appears only once the round is finished and opens both final standings', async () => {
  const source = await read();
  assert.match(source, /\{isRoundFinished && \(\s*<button\s*onClick=\{\(\) => setShowFinalStandings\(true\)\}/);
  assert.match(source, /Clasificación final de la partida<\/h3>\s*<div className="grid grid-cols-1 gap-2">\s*\{cardStandings\.map/);
  assert.match(source, /Clasificación general final del grupo<\/h3>\s*<div className="grid grid-cols-1 gap-2">\s*\{groupStandings\.map/);
});

test('gamification sections show only marked players and hide when nobody is marked', async () => {
  const source = await read();
  assert.doesNotMatch(source, /Ninguno/);
  assert.match(source, /\.filter\(item => item\.noPasoRojasHoles\.length > 0\)/);
  assert.match(source, /if \(!marked\.length\) return null;/);
  assert.match(source, /\.filter\(section => section\.marked\.length > 0\);\s*if \(!visible\.length\) return null;/);
});
