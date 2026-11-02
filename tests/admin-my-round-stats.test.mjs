import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { computeMyRoundStats } from '../src/utils/myRoundStats.ts';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const screen = await readFile(new URL('../src/components/MyRoundStatistics.tsx', import.meta.url), 'utf8');

const holes = [1, 2, 3].map(hole_number => ({ hole_number, par: 4 }));
const player = (id, name, playing_handicap) => ({ id, round_id: 'r1', name, playing_handicap, exact_handicap: playing_handicap, created_at: '2026-11-01T10:00:00Z' });
const score = (player_id, hole_number, gross_strokes, net_strokes, stableford_points, extra = {}) =>
  ({ player_id, hole_number, gross_strokes, net_strokes, stableford_points, strokes_received: 0, abandoned: false, no_paso_rojas: false, mode_points: 0, ...extra });

const me = player('me', 'Enzo', 2);
const ana = player('ana', 'Ana', 0);
const scores = [
  score('me', 1, 4, 3, 3), // birdie neto
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
  assert.deepEqual(stats.holes.map(hole => [hole.holeNumber, hole.points, hole.grossStrokes, hole.abandoned]), [[1, 3, 4, false], [2, 0, 8, false], [3, 0, 7, true]]);
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

test('Mis partidas opens the personal screen and the full standings start collapsed', () => {
  assert.match(app, /onShowRoundStats=\{\(\) => openFromProfile\(currentGroup \? 'statistics' : 'my-round-statistics'\)\}/);
  assert.match(app, /currentView === 'my-round-statistics' && user[\s\S]*?<MyRoundStatistics\s+account=\{\{ userId: user\.id/);
  assert.match(screen, /const \[showStandings, setShowStandings\] = useState\(false\)/);
  assert.match(screen, /'Ver clasificación completa'/);
  assert.match(screen, /aria-expanded=\{showStandings\}/);
  assert.match(screen, /Selecciona la partida a consultar/);
});
