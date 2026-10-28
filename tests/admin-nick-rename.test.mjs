import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createGroupDatabase } from './helpers/group-database.mjs';

test('profile hides the support id and reveals it only for the exact current-nick command', async () => {
  const source = await readFile(new URL('../src/components/ProfileDetails.tsx', import.meta.url), 'utf8');
  assert.match(source, /nick\.trim\(\) === `\$\{profile\.nick\}123#`/);
  assert.match(source, /showSupportId && <div>/);
  assert.match(source, /setNick\(profile\.nick\)/);
  assert.doesNotMatch(source, /disabled=\{!!profile\}/);
  assert.match(source, /maxLength=\{profile \? 28 : 24\}/);
});

test('account nick rename propagates only through stable identities', async () => {
  const db = new PGlite();
  const [account, other, group, round, archive, guest] = Array.from({ length: 6 }, randomUUID);
  try {
    await createGroupDatabase(db);
    await db.exec('ALTER TABLE user_profiles ADD COLUMN updated_at timestamptz DEFAULT now();');
    await db.query('INSERT INTO auth.users VALUES($1),($2)', [account, other]);
    await db.query("INSERT INTO user_profiles(user_id,nick,exact_handicap) VALUES($1,'OldNick',18),($2,'Occupied',12)", [account, other]);
    await db.query('INSERT INTO groups VALUES($1,$2)', [group, account]);
    for (const name of ['20260917100000_group_member_players.sql','20260918100000_group_guest_players.sql','20260919100000_guest_creation_choices.sql','20261021160000_group_roster_guests.sql','20261021170000_group_unregistered_members.sql','20261022110000_editable_account_nicks.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
    }
    await db.query("SELECT set_config('request.uid',$1,false)", [account]);
    const player = (await db.query('SELECT id FROM players WHERE auth_user_id=$1', [account])).rows[0].id;
    await db.query("INSERT INTO players(id,group_id,name,exact_handicap,is_guest) VALUES($1,$2,'OldNick',5,false)", [guest, group]);
    await db.query("INSERT INTO golf_rounds(id,group_id,num_holes,use_slope,status) VALUES($1,$2,18,false,'completed')", [round, group]);
    await db.exec('ALTER TABLE round_players DISABLE TRIGGER USER;');
    const participation = (await db.query("INSERT INTO round_players(round_id,player_id,user_id,name,exact_handicap,playing_handicap,is_guest) VALUES($1,$2,$3,'OldNick',9,18,false) RETURNING id", [round, player, account])).rows[0].id;
    await db.exec('ALTER TABLE round_players ENABLE TRIGGER USER; ALTER TABLE archived_rounds DISABLE TRIGGER USER;');
    const ranking = [{ player_db_id: player, player_id: participation, player_name: 'OldNick', points: 10 }];
    await db.query("INSERT INTO archived_rounds(id,group_id,course_name,played_at,final_ranking,player_stats,hole_scores,source_round_id) VALUES($1,$2,'Course',now(),$3,$3,$3,$4)", [archive, group, JSON.stringify(ranking), round]);
    await db.exec('ALTER TABLE archived_rounds ENABLE TRIGGER USER;');
    await db.query("INSERT INTO daily_rankings(group_id,ranking_date,player_name,total_points,position,receives_beer,pays_beer,game_player_id) VALUES($1,current_date,'OldNick',10,1,false,false,$2)", [group, player]);
    await db.exec('ALTER TABLE handicap_adjustments DISABLE TRIGGER USER;');
    await db.query("INSERT INTO handicap_adjustments(group_id,player_id,player_name,archived_round_id) VALUES($1,$2,'OldNick',$3)", [group, player, archive]);
    await db.exec('ALTER TABLE handicap_adjustments ENABLE TRIGGER USER;');
    await db.query("SELECT set_config('request.uid',$1,false)", [account]);
    await db.exec('SET ROLE authenticated');

    const renamed = (await db.query("SELECT (rename_my_nick('NewNick')).nick nick")).rows[0];
    assert.equal(renamed.nick, 'NewNick');
    await db.exec('RESET ROLE');
    assert.equal((await db.query('SELECT name FROM players WHERE id=$1', [player])).rows[0].name, 'NewNick');
    assert.equal((await db.query('SELECT name FROM players WHERE id=$1', [guest])).rows[0].name, 'OldNick');
    assert.equal((await db.query('SELECT name FROM round_players WHERE id=$1', [participation])).rows[0].name, 'NewNick');
    const saved = (await db.query('SELECT final_ranking,player_stats,hole_scores FROM archived_rounds WHERE id=$1', [archive])).rows[0];
    assert.equal(saved.final_ranking[0].player_name, 'NewNick');
    assert.equal(saved.player_stats[0].player_name, 'NewNick');
    assert.equal(saved.hole_scores[0].player_name, 'NewNick');
    assert.equal((await db.query('SELECT player_name FROM daily_rankings WHERE game_player_id=$1', [player])).rows[0].player_name, 'NewNick');
    assert.equal((await db.query('SELECT player_name FROM handicap_adjustments WHERE player_id=$1', [player])).rows[0].player_name, 'NewNick');
    await db.exec('SET ROLE authenticated');
    await assert.rejects(db.query("SELECT rename_my_nick('occupied')"), /ya está en uso/);
    await assert.rejects(db.query("SELECT rename_my_nick('Bad#')"), /no puede contener/);
  } finally { await db.close(); }
});
