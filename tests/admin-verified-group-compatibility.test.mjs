import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createGroupDatabase } from './helpers/group-database.mjs';

const read=name=>readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const A='00000000-0000-4000-8000-000000000001', B='00000000-0000-4000-8000-000000000002', G='10000000-0000-4000-8000-000000000001';
test('new score protections coexist with real registered-player and guest-player guards and archive snapshots',async()=>{
 const db=new PGlite();try {
  await createGroupDatabase(db);
  await db.exec(`
   ALTER TABLE app_administrators ADD COLUMN alias text;
   ALTER TABLE golf_rounds ALTER COLUMN id SET DEFAULT gen_random_uuid(), ADD COLUMN user_id text, ADD COLUMN created_by uuid,
    ADD COLUMN created_at timestamptz DEFAULT now(),ADD COLUMN updated_at timestamptz DEFAULT now(), ADD COLUMN completed_at timestamptz,
    ADD COLUMN admin_withdrawn_at timestamptz,ADD COLUMN admin_previous_status text;
   ALTER TABLE round_scores ADD COLUMN id uuid DEFAULT gen_random_uuid(),ADD COLUMN hole_number integer,
    ADD COLUMN gross_strokes integer,ADD COLUMN net_strokes integer,ADD COLUMN strokes_received integer,
    ADD COLUMN no_paso_rojas boolean DEFAULT false,ADD COLUMN abandoned boolean DEFAULT false,ADD COLUMN updated_at timestamptz DEFAULT now();
   ALTER TABLE round_scores ADD CONSTRAINT scores_unique UNIQUE(round_id,player_id,hole_number);
   INSERT INTO auth.users VALUES('${A}'),('${B}');
   INSERT INTO user_profiles(user_id,nick,exact_handicap) VALUES('${A}','Owner',18),('${B}','Member',18);
   INSERT INTO groups VALUES('${G}','${A}');
   INSERT INTO group_members(group_id,user_id,role) VALUES('${G}','${B}','member');
   GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
   GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO anon,authenticated;
  `);
  for(const file of ['20260917100000_group_member_players.sql','20260918100000_group_guest_players.sql','20260919100000_guest_creation_choices.sql']) await db.exec(await read(file));
  const admin=await read('20260912190000_app_round_management.sql');
  await db.exec(admin.slice(admin.indexOf('CREATE FUNCTION public.admin_change_app_round('),admin.indexOf('CREATE FUNCTION public.count_available_quick_rounds(')));
  await db.exec(await read('20261028100000_verified_round_owners.sql'));
  await db.query("SELECT set_config('request.uid',$1,false)",[A]);await db.exec('SET ROLE authenticated');
  const r=(await db.query("INSERT INTO golf_rounds(user_id,group_id,num_holes,use_slope,status) VALUES($1,$2,9,false,'active') RETURNING id",[A,G])).rows[0].id;
  const guest=(await db.query('SELECT * FROM add_group_round_player($1,$2,$3,9,true,NULL)',[G,r,'Visitor'])).rows[0];
  const linked=(await db.query('SELECT id,exact_handicap FROM players WHERE group_id=$1 AND auth_user_id=$2',[G,B])).rows[0];
  const habitual=(await db.query('SELECT * FROM add_group_round_player($1,$2,$3,$4,false,$5)',[G,r,'Member',linked.exact_handicap,linked.id])).rows[0];
  const rows=[guest,habitual].map(p=>({round_id:r,player_id:p.id,hole_number:1,gross_strokes:4,net_strokes:4,strokes_received:0,stableford_points:2}));
  await db.query('SELECT * FROM write_verified_hole_scores($1,1,$2::jsonb)',[r,JSON.stringify(rows)]);
  await db.query("UPDATE golf_rounds SET status='completed' WHERE id=$1",[r]);
  const ranking=[guest,habitual].map((p,i)=>({position:i+1,player_id:p.id,player_db_id:p.player_id,player_name:p.name,points:2,hcp_juego:p.playing_handicap,is_guest:p.is_guest}));
  const archive=(await db.query("INSERT INTO archived_rounds(group_id,source_round_id,played_at,final_ranking,player_stats) VALUES($1,$2,now(),$3::jsonb,'[]') RETURNING id",[G,r,JSON.stringify(ranking)])).rows[0].id;
  assert.ok(archive);
  const snapshot=(await db.query('SELECT final_ranking FROM archived_rounds WHERE id=$1',[archive])).rows[0].final_ranking;
  assert.equal(snapshot.find(p=>p.player_id===guest.id).is_guest,true);
  await db.query("UPDATE golf_rounds SET status='deleted' WHERE id=$1",[r]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM round_scores WHERE round_id=$1',[r])).rows[0].n,2);
 } finally {await db.close();}
});
