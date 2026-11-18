import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('deleted players keep their nick behind the skull mark', async () => {
  const js = ts.transpileModule(await read('../src/utils/deletedPlayer.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  Function('module', 'exports', js)(module, module.exports);
  const { parseDeletedPlayer, DELETED_PLAYER_MARK } = module.exports;
  assert.equal(DELETED_PLAYER_MARK, '☠ ');
  assert.deepEqual(parseDeletedPlayer('☠ Kikeas01'), { deleted: true, nick: 'Kikeas01' });
  assert.deepEqual(parseDeletedPlayer('Kikeas01'), { deleted: false, nick: 'Kikeas01' });
  assert.deepEqual(parseDeletedPlayer(null), { deleted: false, nick: '' });
});

test('player names render deleted players in grey with a skull across rounds, groups and statistics', async () => {
  const [component, migration, deletion] = await Promise.all([
    read('../src/components/PlayerName.tsx'),
    read('../supabase/migrations/20261120100000_deleted_players_keep_nick.sql'),
    read('../src/components/DeleteAccountSection.tsx'),
  ]);
  assert.match(component, /<Skull /);
  assert.match(component, /text-ink-4/);
  assert.match(component, /se dio de baja/);
  for (const screen of ['Leaderboard', 'Scorecard', 'HoleCard', 'ActiveRoundsViewer', 'Statistics', 'RoundStatistics', 'QuickPlayStatistics', 'GamePoints', 'ArchivedRoundDetailModal', 'AwardRankingModal', 'PlayerSetup']) {
    assert.match(await read(`../src/components/${screen}.tsx`), /<PlayerName name=\{/, screen);
  }
  assert.match(migration, /anonymous_name := public\.deleted_player_name\(old_nick\);/);
  assert.match(migration, /SELECT '☠ ' \|\| coalesce\(nullif\(trim\(p_nick\),''\),'Jugador eliminado'\)/);
  assert.match(migration, /UPDATE public\.players SET name='☠ Jugador eliminado' WHERE name='Jugador eliminado';/);
  assert.match(deletion, /Tu nick se mantiene en el historial/);
  assert.doesNotMatch(deletion, /Tu nombre desaparece del historial/);
});
