import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const statistics = await readFile(new URL('../src/components/CareerStatistics.tsx', import.meta.url), 'utf8');

test('career statistics show Moments for every plan, Player included', () => {
  assert.doesNotMatch(app, /showMoments=/);
  assert.doesNotMatch(statistics, /showMoments/);
  assert.match(statistics, /<Section icon=\{Award\} title="Momentos">/);
});

test('career statistics follow the A–G layout and open Mis partidas from the last rounds', () => {
  const order = ['A. CABECERO COMPACTO', 'B. TENDENCIA DE STABLEFORD Y HÁNDICAP', 'D. DISTRIBUCIÓN DE RESULTADOS', 'E. MOMENTOS', 'F. PARTIDAS POR MODALIDAD', 'C. RENDIMIENTO POR CAMPO', 'G. ÚLTIMAS 3 PARTIDAS'];
  const positions = order.map(marker => statistics.indexOf(marker));
  assert.ok(positions.every(position => position > 0), 'every section is present');
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'sections appear in order');
  assert.match(statistics, /frequentModes\.length >= 2 &&/, 'modes only with several frequent formats');
  assert.match(statistics, /stats\.recent\.slice\(0, 3\)/);
  assert.match(app, /onOpenMyRounds=\{\(roundId\) => \{\s*setMyRoundsSelectedId\(roundId \?\? null\);\s*setMyRoundsReturnView\('career-statistics'\);\s*setCurrentView\('my-round-statistics'\);/);
});
