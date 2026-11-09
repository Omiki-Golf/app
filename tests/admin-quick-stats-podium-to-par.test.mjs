import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const stats = await readFile(new URL('../src/components/QuickPlayStatistics.tsx', import.meta.url), 'utf8');

test('podium "vs Par Personal" belongs to the ranked player, not to the unsorted highlights position', () => {
  assert.doesNotMatch(stats, /highlights\[\d\]\?\.scoreToPar/);
  assert.match(stats, /const getPlayerScoreToPar = \(playerId: string\) => highlights\.find\(\(h\) => h\.playerId === playerId\)/);
  assert.match(stats, /ranking\.map\(\(entry, index\)[\s\S]*?filter\(item => item\.position <= 3\)[\s\S]*?const toPar = getPlayerScoreToPar\(entry\.player\.id\);[\s\S]*?\{toPar\.display\}/);
});

test('compact podium cards show HCP next to the name and points / vs par in two columns', () => {
  const podium = stats.slice(stats.indexOf('const renderPodiumGrid'), stats.indexOf('const renderStatisticsDetails'));
  assert.match(podium, /\{entry\.player\.name\}<\/p>\s*<span[^>]*>HCP \{entry\.player\.playing_handicap\}<\/span>/);
  assert.match(podium, /gameMode === 'stableford' \? 'grid-cols-2' : 'grid-cols-1'/);
  assert.doesNotMatch(podium, /text-5xl|p-6|border-4/);
});

test('match and parejas show both compact cards in one row with VS centred above', () => {
  const versus = stats.slice(stats.indexOf('const renderVersusCards'), stats.indexOf('const renderStatisticsDetails'));
  assert.ok(versus.indexOf('>VS</span>') < versus.indexOf('grid grid-cols-2'), 'VS goes above the cards');
  assert.doesNotMatch(versus, /text-5xl|p-6|border-4|md:flex-row/);
  assert.equal((stats.match(/\{renderVersusCards\(/g) || []).length, 2);
  assert.match(stats, /renderVersusCards\(\s*'bg-red-600',\s*\{ label: matchResult\.isTie \? 'Empate' : 'Ganador'/);
  assert.match(stats, /renderVersusCards\(\s*'bg-blue-600',\s*\{ label: teamResult\.isTie \? 'Empate' : 'Ganadora'/);
  assert.match(versus, /HCP \{winner\.handicap\}/);
  assert.match(versus, /HCP \{loser\.handicap\}/);
});
