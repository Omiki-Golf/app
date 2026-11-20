import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';
import { createGroupDatabase } from './helpers/group-database.mjs';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

const loadRule = async () => {
  const js = ts.transpileModule(await read('../src/utils/handicapVariation.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  Function('module', 'exports', js)(module, module.exports);
  return module.exports;
};

test('«Primero baja, último sube» only moves the winner and the last player', async () => {
  const { baseHandicapAdjustment } = await loadRule();
  const rule = (total, mode) => Array.from({ length: total }, (_, index) => baseHandicapAdjustment(index, total, mode));
  assert.deepEqual(rule(4, 'primero_ultimo'), [-1, 0, 0, 1]);
  assert.deepEqual(rule(5, 'primero_ultimo'), [-1, 0, 0, 0, 1]);
  assert.deepEqual(rule(2, 'primero_ultimo'), [-1, 1]);
  assert.deepEqual(rule(1, 'primero_ultimo'), [0]);
  assert.deepEqual(rule(4, 'mitad'), [-1, -1, 1, 1]);
  assert.deepEqual(rule(5, 'mitad'), [-1, -1, 0, 1, 1]);
});

test('every handicap calculation reads the group variation instead of always halving', async () => {
  const golf = await read('../src/services/golfService.ts');
  const screen = await read('../src/components/GamePoints.tsx');
  const settings = await read('../src/services/groupSettingsService.ts');
  assert.equal((golf.match(/baseHandicapAdjustment\(index, totalPlayers, variationMode\)/g) || []).length, 3);
  assert.doesNotMatch(golf, /middleIndex/);
  assert.match(screen, /baseHandicapAdjustment\(index, totalPlayers, variationMode\)/);
  assert.match(settings, /rpc\('save_group_settings'/);
});

async function setup() {
  const db = new PGlite();
  await createGroupDatabase(db);
  const [owner, member, group] = Array.from({ length: 3 }, randomUUID);
  await db.query('INSERT INTO auth.users VALUES($1),($2)', [owner, member]);
  await db.query("INSERT INTO user_profiles(user_id,nick,exact_handicap) VALUES($1,'Owner',18),($2,'Alex',18)", [owner, member]);
  await db.query('INSERT INTO groups VALUES($1,$2)', [group, owner]);
  await db.query("INSERT INTO group_members(group_id,user_id,role) VALUES($1,$2,'member')", [group, member]);
  await db.exec('GRANT USAGE ON SCHEMA public,auth TO anon,authenticated; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO anon,authenticated;');
  await db.exec('CREATE TABLE beer_stats(round_id uuid,player_id uuid,status text,position int); GRANT SELECT,INSERT,DELETE ON beer_stats TO authenticated;');
  for (const file of [
    '20260103144321_fix_beer_stats_player_id_reference.sql',
    '20260703215241_20260703_restore_missing_ranking_functions.sql',
    '20260917100000_group_member_players.sql',
    '20260918100000_group_guest_players.sql',
    '20260919100000_guest_creation_choices.sql',
    '20261126100000_group_handicap_variation_setting.sql',
  ]) await db.exec(await read(`../supabase/migrations/${file}`));
  const as = async id => {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.uid',$1,false)", [id || '']);
    await db.exec(`SET ROLE ${id ? 'authenticated' : 'anon'}`);
  };
  const playRound = async points => {
    await as(owner);
    const id = randomUUID();
    await db.query("INSERT INTO golf_rounds(id,group_id,num_holes,use_slope,status,game_mode) VALUES($1,$2,18,false,'active','stableford')", [id, group]);
    const players = [];
    for (const [index, score] of points.entries()) {
      const player = (await db.query('SELECT * FROM add_group_round_player($1,$2,$3,$4,false,null)', [group, id, `P${index + 1}`, 6])).rows[0];
      await db.query('INSERT INTO round_scores(round_id,player_id,stableford_points) VALUES($1,$2,$3)', [id, player.id, score]);
      players.push(player);
    }
    await db.query("UPDATE golf_rounds SET status='completed' WHERE id=$1", [id]);
    const ranking = players.map((p, i) => ({ position: i + 1, player_id: p.id, player_db_id: p.player_id, player_name: p.name, points: 0, is_guest: false, hcp_juego: 6 }));
    const stats = players.map(p => ({ player_id: p.id, player_name: p.name, is_guest: false, spanish_hands_count: 0, total_holes_played: 18 }));
    await db.query("INSERT INTO archived_rounds(group_id,course_name,played_at,source_round_id,final_ranking,player_stats,hole_scores) VALUES($1,'Test',now(),$2,$3,$4,'[]')",
      [group, id, JSON.stringify(ranking), JSON.stringify(stats)]);
    const rows = (await db.query('SELECT name, exact_handicap FROM players WHERE id = ANY($1::uuid[]) ORDER BY name', [players.map(p => p.player_id)])).rows;
    return Object.fromEntries(rows.map(row => [row.name, Number(row.exact_handicap)]));
  };
  return { db, owner, member, group, as, playRound };
}

test('archiving a round applies the group variation of handicap', async () => {
  const { db, owner, member, group, as, playRound } = await setup();
  try {
    // Por defecto, «mitad baja, mitad sube».
    assert.deepEqual(await playRound([40, 30, 20, 10]), { P1: 5, P2: 5, P3: 7, P4: 7 });

    await as(member);
    await assert.rejects(db.query("SELECT save_group_settings($1,'primero_ultimo',0)", [group]), /permiso/);
    await as(owner);
    await assert.rejects(db.query("SELECT save_group_settings($1,'otro',0)", [group]), /no válida/);
    await db.query("SELECT save_group_settings($1,'primero_ultimo',2)", [group]);
    const saved = (await db.query('SELECT handicap_variation_mode, min_rounds_for_awards FROM groups WHERE id=$1', [group])).rows[0];
    assert.deepEqual(saved, { handicap_variation_mode: 'primero_ultimo', min_rounds_for_awards: 2 });

    // Todos empiezan la partida con HCP 6: ganador baja, último sube, los del medio no cambian.
    assert.deepEqual(await playRound([40, 30, 20, 10]), { P1: 5, P2: 6, P3: 6, P4: 7 });
    // Con impares, el de enmedio tampoco cambia.
    assert.deepEqual(await playRound([10, 30, 20]), { P1: 7, P2: 5, P3: 6 });
  } finally {
    await db.close();
  }
});
