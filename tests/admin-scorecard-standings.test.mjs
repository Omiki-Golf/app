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
  assert.match(source, /markedHoles\(person\.scores, score => score\.no_paso_rojas\) \}\)\)\s*\.filter\(item => item\.holes\.length > 0\)/);
  assert.match(source, /\.filter\(section => section\.marked\.length > 0\);\s*if \(!rojas\.length && !sections\.length\) return null;/);
});

test('standing rows show the gamification icons of each player for the whole round', async () => {
  const source = await read();
  assert.match(source, /marks\?: Array<\{ productId: string; holes: number\[\] \}>/);
  assert.match(source, /entry\.marks\.map\(mark => \([\s\S]{0,200}<GamificationBadge\s+productId=\{mark\.productId\}/);
  assert.match(source, /marks: gamificationMarks\(cardScores\)/);
  // La general del grupo usa los golpes de cada tarjeta (en vivo para la propia).
  assert.match(source, /\.\.\.playerTotals\(scores, holeNumber => pars\.get\(holeNumber\)\),\s*marks: gamificationMarks\(scores\)/);
});

test('the group standings also show the gamification of every card that day', async () => {
  const source = await read();
  assert.match(source, /\{renderGamification\(cardGamificationPeople, ''\)\}/);
  assert.match(source, /\{groupStandings\.map\(row => <StandingRow key=\{row\.entry\.key\} \{\.\.\.row\} \/>\)\}\s*<\/div>\s*\{\/\*[^*]*\*\/\}\s*\{renderGamification\(groupGamificationPeople, ' · grupo'\)\}/);
  // La tarjeta propia usa sus golpes en vivo también para la gamificación del grupo.
  assert.match(source, /const groupGamificationPeople[\s\S]{0,400}mine\s*\? Object\.values\(roundsMap\.get\(player\.id\)\?\.scores \?\? \{\}\)/);
});

test('the trophy button is round like the other top buttons', async () => {
  const source = await read();
  assert.match(source, /onClick=\{\(\) => setShowFinalStandings\(true\)\}[\s\S]{0,120}h-11 w-11[^"]*rounded-full/);
});

test('leaving a group round goes back to the list of rounds, not the group home', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /const handleBackFromScorecard = \(\) => \{\s*handleBackToMain\(\);\s*if \(currentGroup\) setCurrentView\('active-rounds'\);/);
  assert.match(app, /<Scorecard backDestination="back"/);
  assert.match(app, /onResetGame=\{handleBackFromScorecard\}/);
});

test('the rounds list shows a round trophy, the centered group name and a Partida/Partidas card', async () => {
  const viewer = await readFile(new URL('../src/components/ActiveRoundsViewer.tsx', import.meta.url), 'utf8');
  assert.match(viewer, /onClick=\{\(\) => setShowGlobalLeaderboard\(true\)\}[\s\S]{0,80}h-11 w-11[^"]*rounded-full/);
  assert.match(viewer, /<h1 className="text-center text-3xl font-bold text-title">\{currentGroup\.name \|\| 'Grupo'\}<\/h1>/);
  assert.match(viewer, /\{rounds\.length === 1 \? 'Partida' : 'Partidas'\}/);
  assert.match(viewer, /<section className=\{currentGroup \? 'rounded-2xl border border-line bg-card p-3 shadow-soft' : undefined\}>/);
});
