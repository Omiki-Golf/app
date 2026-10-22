import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createGroupDatabase } from './helpers/group-database.mjs';

const roster = await readFile(new URL('../src/components/GroupMemberList.tsx', import.meta.url), 'utf8');
const service = await readFile(new URL('../src/services/userService.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261021160000_group_roster_guests.sql', import.meta.url), 'utf8');
const memberMigration = await readFile(new URL('../supabase/migrations/20261021170000_group_unregistered_members.sql', import.meta.url), 'utf8');

test('group roster includes guests and offers the same registered-or-guest addition flow', () => {
  assert.match(migration, /p\.auth_user_id IS NULL/);
  assert.match(migration, /'is_guest',true/);
  assert.match(roster, /searchByNick/);
  assert.match(roster, /addGroupGuest/);
  assert.match(roster, /HCP 18 hoyos/);
});

test('compact roster uses a trash icon and administrator crown', () => {
  assert.match(roster, /Trash2/);
  assert.match(roster, /<Crown/);
  assert.doesNotMatch(roster, />Eliminar del grupo<\/WriteButton>/);
  assert.doesNotMatch(roster, />Hacer administrador<\/WriteButton>/);
  assert.match(service, /manage_group_guest_player/);
  assert.match(memberMigration, /is_guest\)[\s\S]{0,120}false/);
  assert.match(memberMigration, /invite_group_user_once/);
});

test('an unregistered player added from a group round is a reusable roster member for owner and admin', async () => {
  const db = new PGlite();
  const [owner, admin, group, firstRound, secondRound] = Array.from({ length: 5 }, randomUUID);
  try {
    await createGroupDatabase(db);
    await db.query('INSERT INTO auth.users VALUES($1),($2)', [owner, admin]);
    await db.query("INSERT INTO user_profiles(user_id,nick,exact_handicap) VALUES($1,'Owner',18),($2,'Admin',18)", [owner, admin]);
    await db.query('INSERT INTO groups VALUES($1,$2)', [group, owner]);
    await db.query("INSERT INTO group_members(group_id,user_id,role) VALUES($1,$2,'admin')", [group, admin]);
    await db.exec('GRANT USAGE ON SCHEMA public,auth TO anon,authenticated; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO anon,authenticated;');
    for (const name of [
      '20260917100000_group_member_players.sql',
      '20260918100000_group_guest_players.sql',
      '20260919100000_guest_creation_choices.sql',
      '20261021160000_group_roster_guests.sql',
      '20261021170000_group_unregistered_members.sql',
    ]) await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
    const as = async userId => { await db.exec('RESET ROLE'); await db.query("SELECT set_config('request.uid',$1,false)", [userId]); await db.exec('SET ROLE authenticated'); };
    const roster = async () => (await db.query('SELECT list_identified_group_members($1) value', [group])).rows[0].value;

    await db.query("INSERT INTO golf_rounds(id,group_id,num_holes,use_slope,status) VALUES($1,$2,18,false,'active')", [firstRound, group]);
    await as(admin);
    const first = (await db.query("SELECT * FROM add_group_round_player($1,$2,'Jugador sin cuenta',9,false,NULL)", [group, firstRound])).rows[0];
    assert.equal(first.is_guest, false);
    let member = (await roster()).find(item => item.player_id === first.player_id);
    assert.equal(member.profile.nick, 'Jugador sin cuenta');
    assert.equal(member.role, 'member');
    assert.equal(member.handicap_18, 18);

    await db.query("UPDATE golf_rounds SET status='completed' WHERE id=$1", [firstRound]);
    await db.query("INSERT INTO golf_rounds(id,group_id,num_holes,use_slope,status) VALUES($1,$2,18,false,'active')", [secondRound, group]);
    const reused = (await db.query("SELECT * FROM add_group_round_player($1,$2,'Jugador sin cuenta',9,false,$3)", [group, secondRound, first.player_id])).rows[0];
    assert.equal(reused.player_id, first.player_id);
    assert.equal((await roster()).filter(item => item.player_id === first.player_id).length, 1);

    await as(owner);
    member = (await roster()).find(item => item.player_id === first.player_id);
    assert.equal(member.profile.nick, 'Jugador sin cuenta');
  } finally { await db.close(); }
});
