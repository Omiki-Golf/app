import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { computeMyRoundStats } from '../src/utils/myRoundStats.ts';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const screen = await readFile(new URL('../src/components/MyRoundStatistics.tsx', import.meta.url), 'utf8');

// Hándicap de hoyo 1, 3 y 2: con HCP 2 se recibe un golpe en los hoyos 1 y 3, como en la tarjeta.
const holes = [[1, 1], [2, 3], [3, 2]].map(([hole_number, stroke_index]) => ({ hole_number, par: 4, stroke_index }));
const player = (id, name, playing_handicap) => ({ id, round_id: 'r1', name, playing_handicap, exact_handicap: playing_handicap, created_at: '2026-11-01T10:00:00Z' });
const score = (player_id, hole_number, gross_strokes, net_strokes, stableford_points, extra = {}) =>
  ({ player_id, hole_number, gross_strokes, net_strokes, stableford_points, strokes_received: 0, abandoned: false, no_paso_rojas: false, mode_points: 0, ...extra });

const me = player('me', 'Enzo', 2);
const ana = player('ana', 'Ana', 0);
const scores = [
  score('me', 1, 4, 3, 3, { strokes_received: 1 }), // birdie neto con un golpe de ventaja
  score('me', 2, 8, 7, 0), // triple bogey neto
  score('me', 3, 0, 0, 0, { abandoned: true, strokes_received: 1 }), // bola levantada: 4 + 1 + 2 golpes
  score('ana', 1, 4, 4, 2),
  score('ana', 2, 5, 5, 1),
  score('ana', 3, 6, 6, 0),
];
const summary = {
  ranking: [{ player: ana }, { player: me }],
  awards: { reyDelBosque: { player: ana, count: 1 }, noPasoRojas: { player: me, count: 1 }, holeInOne: null, hoyoMuerte: null, hoyoGloria: null, laPaliza: null },
};

test('my round stats describe only how the account player played', () => {
  const stats = computeMyRoundStats(me, [me, ana], scores, holes, summary);

  assert.equal(stats.position, 2);
  assert.equal(stats.totalPlayers, 2);
  assert.equal(stats.points, 3, 'Stableford points without the abandoned hole');
  assert.equal(stats.handicap, 2);
  assert.equal(stats.totalGrossStrokes, 19);
  assert.deepEqual(stats.toPar, { value: 5, display: '+5' }, '19 strokes against par 12 + HCP 2');
  assert.deepEqual(stats.bestHole, { holeNumber: 1, points: 3 });
  assert.deepEqual(stats.worstHole, { holeNumber: 2, points: 0 }, 'the abandoned hole is not the worst hole');
  assert.equal(stats.birdies, 1);
  assert.equal(stats.variability, 3);
  assert.deepEqual(stats.distribution, { eagle: 0, birdie: 1, par: 0, bogey: 0, double: 1, triplePlus: 1 });
  assert.deepEqual(stats.holes.map(hole => [hole.holeNumber, hole.par, hole.strokeIndex, hole.points, hole.grossStrokes, hole.abandoned, hole.strokesReceived]),
    [[1, 4, 1, 3, 4, false, 1], [2, 4, 3, 0, 8, false, 0], [3, 4, 2, 0, 7, true, 1]]);
});

test('Mi tarjeta shows P•H above each hole and the hole points under the dots', () => {
  assert.match(screen, /P\{hole\.par\}•H\{hole\.strokeIndex\}/);
  assert.match(screen, /bg-blue-500[\s\S]*?\{hole\.played \? hole\.points : '–'\}/, 'points come after the advantage dots');
  assert.doesNotMatch(screen, /Puntos del hoyo|tu HCP en esta partida/, 'no legend under the card');
});

test('Mis partidas layout: Momentazos, values at the base, to-par bars, one card with dots and a statistics button', () => {
  assert.match(screen, />Mis Momentazos</);
  assert.doesNotMatch(screen, /Mis highlights/);
  assert.equal((screen.match(/<dd className=[{`"]*mt-auto pt-1 text-3xl/g) || []).length, 3, 'points, HCP and vs par sit at the base of their cards');
  assert.match(screen, /grid-cols-\[6\.5rem_1fr_2\.5rem\]/, 'same bars as Mis estadísticas');
  assert.match(screen, /key: 'double', label: 'Doble bogey'[\s\S]*key: 'triplePlus', label: 'Triple o peor'/, 'doubles and triples+ stay apart');
  assert.doesNotMatch(screen, /Puntos por hoyo|Tarjeta \(golpes\)/, 'points per hole and the strokes card are one table');
  assert.match(screen, /Array\.from\(\{ length: hole\.strokesReceived \}\)[\s\S]*?h-1 w-1 rounded-full bg-blue-500/, 'advantage dots the same size as the scorecard');
  assert.match(screen, /onClick=\{\(\) => onViewRoundStatistics\(selectedRoundId\)\}[\s\S]*?Ver estadísticas/);
  assert.match(app, /onViewRoundStatistics=\{\(roundId\) => \{\s*setMyRoundsSelectedId\(roundId\);\s*setStatisticsRoundId\(roundId\);\s*setStatisticsReturnView\('my-round-statistics'\);\s*setCurrentView\('quickplay-statistics'\);/);
  assert.match(app, /initialRoundId=\{myRoundsSelectedId\}/);
});

test('my awards only list the ones I won', () => {
  const stats = computeMyRoundStats(me, [me, ana], scores, holes, summary);
  assert.deepEqual(stats.awards.map(award => award.key), ['mejor-hoyo', 'peor-hoyo', 'maquina', 'montana-rusa', 'no-paso-rojas']);
  assert.equal(stats.awards.find(award => award.key === 'maquina')?.title, 'Máquina');

  const anaStats = computeMyRoundStats(ana, [me, ana], scores, holes, summary);
  assert.deepEqual(anaStats.awards.map(award => award.key), ['rey-mas-uno', 'rey-del-bosque']);
});

test('the full standings keep the official order with HCP, Stableford points and vs par', () => {
  const stats = computeMyRoundStats(me, [me, ana], scores, holes, summary);
  assert.deepEqual(stats.standings.map(row => [row.position, row.name, row.handicap, row.points, row.toPar.display, row.isMe]), [
    [1, 'Ana', 0, 3, '+3', false],
    [2, 'Enzo', 2, 3, '+5', true],
  ]);
});

test('a new account object from App does not reload the screen or reset the selected round', () => {
  // App pasa account={{ ... }} en cada render (avisos, comprobaciones periódicas): depender del objeto recargaba la lista y volvía a la primera partida.
  assert.doesNotMatch(screen, /\}, \[account\]\)/);
  assert.match(screen, /const \{ userId, nick, displayName \} = account;/);
  assert.match(screen, /\}, \[userId, nick, displayName\]\);/);
  assert.match(screen, /if \(request !== latestRequest\.current\) return;/, 'late answers from a previous selection are ignored');
});

test('Mis partidas opens the personal screen and the full standings start collapsed', () => {
  assert.match(app, /onShowRoundStats=\{\(\) => openFromProfile\(currentGroup \? 'statistics' : 'my-round-statistics'\)\}/);
  assert.match(app, /currentView === 'my-round-statistics' && user[\s\S]*?<MyRoundStatistics\s+account=\{\{ userId: user\.id/);
  assert.match(screen, /const \[showStandings, setShowStandings\] = useState\(false\)/);
  assert.match(screen, /'Ver clasificación completa'/);
  assert.match(screen, /aria-expanded=\{showStandings\}/);
  assert.match(screen, /Selecciona la partida a consultar/);
});
