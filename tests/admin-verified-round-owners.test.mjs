import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const fixture = await readFile(new URL('./helpers/verified-round-owners-fixture.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261028100000_verified_round_owners.sql', import.meta.url), 'utf8');
const administration = await readFile(new URL('../supabase/migrations/20260912190000_app_round_management.sql', import.meta.url), 'utf8');
const archivedDelete = await readFile(new URL('../supabase/migrations/20261029100000_delete_archived_quick_rounds.sql', import.meta.url), 'utf8');
const setupSQL = fixture + administration.slice(administration.indexOf('CREATE FUNCTION public.admin_change_app_round('), administration.indexOf('CREATE FUNCTION public.count_available_quick_rounds(')) + migration + archivedDelete;
const A='00000000-0000-4000-8000-000000000001', B='00000000-0000-4000-8000-000000000002', ADMIN='00000000-0000-4000-8000-000000000003';
const G='10000000-0000-4000-8000-000000000001';
const SECRET='a'.repeat(64), OTHER='b'.repeat(64);
async function setup() { const db=new PGlite(); await db.exec(setupSQL); return db; }
async function as(db,uid='',secret='') {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.uid',$1,false),set_config('request.headers',$2,false)",[uid,JSON.stringify(secret?{'x-omiki-express-secret':secret}:{})]);
  await db.exec(uid?'SET ROLE authenticated':'SET ROLE anon');
}
async function round(db,owner,group=null) { return (await db.query('INSERT INTO golf_rounds(user_id,group_id) VALUES($1,$2) RETURNING id',[owner,group])).rows[0].id; }
async function player(db,r) { return (await db.query('INSERT INTO round_players(round_id) VALUES($1) RETURNING id',[r])).rows[0].id; }
const score=(r,p,stroke=5)=>({round_id:r,player_id:p,hole_number:1,gross_strokes:stroke,strokes_received:0,net_strokes:stroke,stableford_points:2,mode_points:0});
const save=(db,r,p,stroke=5)=>db.query('SELECT public.write_verified_round_score($1::jsonb)',[JSON.stringify(score(r,p,stroke))]);

test('account creator retains correction; stale members and direct requests cannot write or impersonate',async()=>{
 const db=await setup();try {
  await as(db,A); const r=await round(db,A); const p=await player(db,r); await save(db,r,p);
  await db.query('SELECT finish_round($1,$2)',[r,A]);
  await save(db,r,p,4);
  await as(db,B);
  await assert.rejects(save(db,r,p),/finalizado/);
  await assert.rejects(db.query('UPDATE round_scores SET gross_strokes=3 WHERE round_id=$1',[r]),/finalizado/);
  await assert.rejects(db.query('DELETE FROM round_scores WHERE round_id=$1',[r]),/finalizado/);
  await assert.rejects(db.query('SELECT delete_verified_round_score($1,$2,99)',[r,p]),/finalizado/);
  await assert.rejects(db.query('SELECT finish_round($1,$2)',[r,A]),/finalizado/);
  await assert.rejects(db.query('UPDATE golf_rounds SET user_id=$1 WHERE id=$2',[B,r]),/no se puede cambiar/);
  await assert.rejects(db.query('UPDATE golf_rounds SET status=\'active\' WHERE id=$1',[r]),/creador/);
  await as(db,A); await db.query("UPDATE golf_rounds SET status='archived' WHERE id=$1",[r]);
  await assert.rejects(save(db,r,p),/cerrada/);
  await assert.rejects(db.query('DELETE FROM golf_rounds WHERE id=$1',[r]),/cerrada/);
  // Archivada: el creador solo puede pasarla a borrada (lógico); nadie más, ni otros cambios.
  await assert.rejects(db.query("UPDATE golf_rounds SET status='active' WHERE id=$1",[r]),/cerrada/);
  await as(db,B);
  await assert.rejects(db.query("UPDATE golf_rounds SET status='deleted' WHERE id=$1",[r]),/creador/);
  await as(db,A); await db.query("UPDATE golf_rounds SET status='deleted' WHERE id=$1",[r]);
  await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT status FROM golf_rounds WHERE id=$1',[r])).rows[0].status,'deleted');
 } finally {await db.close();}
});

test('Express credential registration is idempotent, private, required for writes and capped server-side',async()=>{
 const db=await setup();try {
  await as(db,'',SECRET);
  const owner=(await db.query('SELECT register_express_owner($1) AS id',[SECRET])).rows[0].id;
  assert.equal((await db.query('SELECT register_express_owner($1) AS id',[SECRET])).rows[0].id,owner);
  await assert.rejects(db.query('SELECT * FROM express_owner_credentials'),/permission denied/);
  const r=await round(db,owner); const p=await player(db,r); await save(db,r,p);
  await as(db,'',OTHER);
  await db.query('SELECT register_express_owner($1)',[OTHER]);
  await assert.rejects(save(db,r,p),/creador verificado/);
  await assert.rejects(db.query('SELECT finish_express_round($1,$2)',[r,owner]),/creador verificado/);
  await assert.rejects(db.query('INSERT INTO golf_rounds(user_id) VALUES($1)',[owner]),/no verificado/);
  await as(db,'',SECRET);
  await db.query('SELECT finish_express_round($1,$2)',[r,'spoofed-actor-is-ignored']);
  await save(db,r,p,4); await round(db,owner); await round(db,owner); await round(db,owner);
  await assert.rejects(round(db,owner),/límite de 4/);
  await as(db,'',''); await assert.rejects(save(db,r,p),/finalizado/);
  await db.exec('RESET ROLE');
  const stored=(await db.query('SELECT secret_hash FROM express_owner_credentials WHERE owner_id=$1',[owner])).rows[0].secret_hash;
  assert.notEqual(stored,SECRET); assert.equal(stored.length,64);
 } finally {await db.close();}
});

test('verified Express claim cannot be stolen by identifier, is retryable, and never reactivates after account deletion',async()=>{
 const db=await setup();try {
  await as(db,'',SECRET); const owner=(await db.query('SELECT register_express_owner($1) AS id',[SECRET])).rows[0].id;
  const r=await round(db,owner); const p=await player(db,r); await save(db,r,p);
  const withdrawn=await round(db,owner);
  const expected=(await db.query('SELECT updated_at::text AS expected FROM golf_rounds WHERE id=$1',[withdrawn])).rows[0].expected;
  await as(db,ADMIN);
  await db.query("SELECT admin_change_app_round($1,'withdraw','Reviewed withdrawal',$2)",[withdrawn,expected]);
  await as(db,A);
  await assert.rejects(db.query('SELECT claim_device_rounds($1)',[owner]),/recuperación revisada/);
  await assert.rejects(db.query('SELECT claim_verified_express_rounds($1)',[OTHER]),/no disponible/);
  assert.equal((await db.query('SELECT claim_verified_express_rounds($1) AS n',[SECRET])).rows[0].n,2);
  const history=(await db.query('SELECT user_id,status,admin_withdrawn_at FROM golf_rounds WHERE id=$1',[withdrawn])).rows[0];
  assert.equal(history.user_id,A);assert.equal(history.status,'deleted');assert.ok(history.admin_withdrawn_at);
  assert.equal((await db.query('SELECT claim_verified_express_rounds($1) AS n',[SECRET])).rows[0].n,0);
  await save(db,r,p,3);
  await as(db,B); await assert.rejects(db.query('SELECT claim_verified_express_rounds($1)',[SECRET]),/no disponible/);
  await as(db,'',SECRET); await assert.rejects(save(db,r,p),/creador verificado/);
  await db.exec('RESET ROLE'); await db.query('DELETE FROM auth.users WHERE id=$1',[A]);
  await as(db,'',SECRET); await assert.rejects(db.query('SELECT register_express_owner($1)',[SECRET]),/vinculada/);
 } finally {await db.close();}
});

test('group managers retain archive/delete, admins retain audited actions, scores retain creator-only access',async()=>{
 const db=await setup();try {
  await as(db,A); const r=await round(db,A,G); const p=await player(db,r); await save(db,r,p);
  await db.query('SELECT finish_round($1,$2)',[r,A]);
  await as(db,B); await assert.rejects(save(db,r,p),/finalizado/);
  await assert.rejects(db.query('DELETE FROM round_players WHERE id=$1',[p]),/finalizado/);
  await db.query("UPDATE golf_rounds SET status='deleted' WHERE id=$1",[r]);
  await as(db,A); const q=await round(db,A); const qp=await player(db,q); await save(db,q,qp);
  const expected=(await db.query('SELECT updated_at::text AS expected FROM golf_rounds WHERE id=$1',[q])).rows[0].expected;
  await as(db,ADMIN);
  await assert.rejects(save(db,q,qp),/creador verificado/);
  await assert.rejects(db.query('UPDATE golf_rounds SET admin_withdrawn_at=now() WHERE id=$1',[q]),/creador/);
  await db.query("SELECT admin_change_app_round($1,'withdraw','Reviewed test',$2)",[q,expected]);
  await assert.rejects(db.query("SELECT admin_change_app_round_before_owner_guard($1,'restore','Reviewed test',$2)",[q,expected]),/permission denied/);
  await as(db,A); await assert.rejects(save(db,q,qp),/retirada/);
  await db.exec('RESET ROLE'); assert.equal((await db.query("SELECT count(*)::int AS n FROM app_admin_audit WHERE action='round.withdraw'")).rows[0].n,1);
 } finally {await db.close();}
});

test('cross-round keys, readonly accounts, cascades and legacy uncredentialed owners are protected',async()=>{
 const db=await setup();try {
  await as(db,A); const r=await round(db,A); const p=await player(db,r); await save(db,r,p);
  const other=await round(db,A); const op=await player(db,other);
  await assert.rejects(db.query('UPDATE round_scores SET round_id=$1 WHERE round_id=$2',[other,r]),/identidad/);
  await assert.rejects(db.query('UPDATE round_players SET round_id=$1 WHERE id=$2',[other,p]),/identidad/);
  await assert.rejects(save(db,r,op),/otra partida/);
  await db.exec('RESET ROLE'); await db.query('INSERT INTO app_user_restrictions VALUES($1,true)',[A]);
  await as(db,A); await assert.rejects(save(db,r,p),/solo lectura/);
  await db.exec('RESET ROLE'); await db.query('UPDATE app_user_restrictions SET read_only=false');
  await as(db,A); await db.query('DELETE FROM round_players WHERE id=$1',[p]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM round_scores WHERE round_id=$1',[r])).rows[0].n,0);
  await db.query('DELETE FROM golf_rounds WHERE id=$1',[other]);
  await db.exec('RESET ROLE; ALTER TABLE golf_rounds DISABLE TRIGGER a_verified_round_write;');
  const legacy=(await db.query("INSERT INTO golf_rounds(user_id) VALUES('anon_11111111-2222-4333-8444-555555555555') RETURNING id")).rows[0].id;
  await db.exec('ALTER TABLE golf_rounds ENABLE TRIGGER a_verified_round_write');
  await as(db); assert.equal((await db.query('SELECT id FROM golf_rounds WHERE id=$1',[legacy])).rows.length,1);
  await assert.rejects(db.query('UPDATE golf_rounds SET status=\'completed\' WHERE id=$1',[legacy]),/creador/);
  await assert.rejects(db.query('TRUNCATE round_scores'),/permission denied/);
 } finally {await db.close();}
});

test('multi-player hole saves are atomic and retain every score value, including half points',async()=>{
 const db=await setup();try {
  await as(db,A); const r=await round(db,A); const p=await player(db,r); const q=await player(db,r);
  await save(db,r,p); await save(db,r,q);
  const rows=[{...score(r,p,4),mode_points:1},{...score(r,q,7),mode_points:0.5}];
  const saved=await db.query('SELECT * FROM write_verified_hole_scores($1,1,$2::jsonb)',[r,JSON.stringify(rows)]);
  assert.equal(saved.rows.length,2);
  assert.equal(Number(saved.rows.find(s=>s.player_id===q).mode_points),0.5);
  const invalid=[{...score(r,p,3),mode_points:1},{...score(r,q,-1),mode_points:0}];
  await assert.rejects(db.query('SELECT * FROM write_verified_hole_scores($1,1,$2::jsonb)',[r,JSON.stringify(invalid)]),/check constraint/);
  assert.equal((await db.query('SELECT gross_strokes FROM round_scores WHERE player_id=$1',[p])).rows[0].gross_strokes,4);
  await assert.rejects(db.query('SELECT * FROM write_verified_hole_scores($1,2,$2::jsonb)',[r,JSON.stringify(rows)]),/otra partida u hoyo/);
 } finally {await db.close();}
});

test('registered Express limits match active plans, expirations and Team trials',async()=>{
 const db=await setup();try {
  await as(db,B);for(let i=0;i<4;i++)await round(db,B);
  await assert.rejects(round(db,B),/límite de 4/);
  await db.exec('RESET ROLE');
  await db.query("INSERT INTO user_subscriptions VALUES($1,'premium','active',now()-interval '1 day',NULL)",[B]);
  await as(db,B);await assert.rejects(round(db,B),/límite de 4/);
  await db.exec('RESET ROLE');
  await db.query("UPDATE user_subscriptions SET team_trial_ends_at=now()+interval '1 day' WHERE user_id=$1",[B]);
  await as(db,B);await round(db,B);
  await db.exec('RESET ROLE');
  await db.query("UPDATE user_subscriptions SET team_trial_ends_at=NULL,current_period_end=NULL WHERE user_id=$1",[B]);
  await as(db,B);await round(db,B);
 }finally{await db.close();}
});
