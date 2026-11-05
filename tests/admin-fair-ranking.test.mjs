import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { awardChampions, formatAverage, sortRanking, toFairEntries } from '../src/utils/fairRanking.ts';

const statistics = await readFile(new URL('../src/components/Statistics.tsx', import.meta.url), 'utf8');
const modal = await readFile(new URL('../src/components/AwardRankingModal.tsx', import.meta.url), 'utf8');

// «Corto»: veces que no pasó de rojas. 10 en 28 partidas pesan menos que 10 en 20.
const corto = toFairEntries([
  { player_name: 'Alfonso', no_paso_rojas_count: 10, total_rounds: 28, handicap: 15 },
  { player_name: 'Martín', no_paso_rojas_count: 10, total_rounds: 20, handicap: 18 },
  { player_name: 'Pedro', no_paso_rojas_count: 12, total_rounds: 40, handicap: 12 },
  { player_name: 'Sin datos', no_paso_rojas_count: 3, total_rounds: 0, handicap: 20 },
], row => row.no_paso_rojas_count);

test('the fair ranking orders by average per round, the absolute one by total', () => {
  assert.deepEqual(sortRanking(corto, 'fair').map(entry => entry.name), ['Martín', 'Alfonso', 'Pedro', 'Sin datos'], 'no rounds go last');
  assert.deepEqual(sortRanking(corto, 'absolute').map(entry => entry.name), ['Pedro', 'Martín', 'Alfonso', 'Sin datos'], 'a tie in total goes to the better average');
  assert.equal(formatAverage(corto.find(entry => entry.name === 'Martín').average), '0,50');
  assert.equal(formatAverage(corto.find(entry => entry.name === 'Alfonso').average), '0,36');
});

test('each award card has an absolute and a fair champion; "fewest" awards rank lowest first', () => {
  const { absolute, fair } = awardChampions(corto);
  assert.deepEqual([absolute.name, fair.name], ['Pedro', 'Martín']);
  const driverOro = awardChampions(corto.filter(entry => entry.rounds > 0), true);
  assert.deepEqual([driverOro.absolute.name, driverOro.fair.name], ['Alfonso', 'Pedro'], 'fewest total (tie broken by average) and lowest per round');
});

test('group statistics show two champions per card, a fair/absolute toggle in the modal and in the general ranking', () => {
  for (const type of ['patrocinador', 'barraLibre', 'corto', 'driverOro', 'shark', 'francotirador', 'maquina', 'amigoDelMasUno', 'reyDelBosque']) {
    assert.match(statistics, new RegExp(`<AwardChampions rows=\\{[^}]+\\} type="${type}"`), `${type} card shows both champions`);
  }
  assert.match(statistics, /type="driverOro"[^>]*lowerIsBetter/);
  assert.match(statistics, /allowFair=\{rankingModal\.type !== 'viciado'\}/, 'rounds played per round is always 1');
  assert.match(modal, /useState<RankingMode>\('absolute'\)/, 'the full ranking opens on the absolute order');
  assert.match(modal, /<span className="text-right">Total<\/span>\s*<span className="text-right">Por partida<\/span>/);
  assert.match(statistics, /useState<RankingMode>\('absolute'\)/);
  assert.match(statistics, /<RankingModeToggle mode=\{generalMode\} onChange=\{setGeneralMode\} \/>/);
});
