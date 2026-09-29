import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const migration = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
const A = "00000000-0000-4000-8000-00000000000a",
  P = "00000000-0000-4000-8000-000000000001",
  Q = "00000000-0000-4000-8000-000000000002",
  R = "00000000-0000-4000-8000-000000000003",
  G = "10000000-0000-4000-8000-000000000001",
  C = "20000000-0000-4000-8000-000000000001",
  T = "30000000-0000-4000-8000-000000000001";

test("admin metrics: access, played-round rules, attribution through participants and usage columns", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,created_at timestamptz DEFAULT now(),last_sign_in_at timestamptz,encrypted_password text,raw_app_meta_data jsonb DEFAULT '{}',raw_user_meta_data jsonb DEFAULT '{}');
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT current_setting('request.jwt.claims',true)::jsonb$$;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT (auth.jwt()->>'sub')::uuid$$;
 GRANT USAGE ON SCHEMA auth TO authenticated,anon;
 CREATE TABLE user_profiles(user_id uuid UNIQUE,nick text UNIQUE,display_name text,avatar_url text,exact_handicap numeric,default_tee text,accepted_terms boolean,updated_at timestamptz DEFAULT now());
 CREATE TABLE user_subscriptions(user_id uuid UNIQUE,plan_type text NOT NULL,status text,payment_hash text,current_period_start timestamptz,current_period_end timestamptz,updated_at timestamptz);
 CREATE TABLE golf_courses(id uuid PRIMARY KEY,name text);
 CREATE TABLE tees(id uuid PRIMARY KEY,course_id uuid,name text);
 CREATE TABLE groups(id uuid PRIMARY KEY,name text,group_code text,created_at timestamptz DEFAULT now(),user_auth_id uuid,max_players integer,premium_branding boolean,weekend_mode_until timestamptz);
 CREATE TABLE group_members(group_id uuid,user_id uuid,role text,joined_at timestamptz DEFAULT now());
 CREATE TABLE group_invitations(group_id uuid,invited_user_id uuid,invited_by uuid,status text,created_at timestamptz DEFAULT now());
 CREATE TABLE players(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid,name text,auth_user_id uuid,is_guest boolean NOT NULL DEFAULT false);
 CREATE TABLE golf_rounds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),course_id uuid,tee_id uuid,group_id uuid,user_id text,num_holes integer,holes_range text,status text,game_mode text DEFAULT 'stableford',created_at timestamptz DEFAULT now(),admin_withdrawn_at timestamptz);
 CREATE TABLE round_players(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),round_id uuid,player_id uuid,user_id uuid,name text);
 CREATE TABLE pro_shop_purchases(group_id uuid,product_type text,status text,amount_paid numeric,created_at timestamptz DEFAULT now(),active_until timestamptz);
 INSERT INTO auth.users(id,email,created_at,last_sign_in_at) VALUES
  ('${A}','a+admin@example.com',now(),now()),
  ('${P}','p@example.com',now()-interval '40 days',now()-interval '1 day'),
  ('${Q}','q@example.com',now()-interval '20 days',NULL),
  ('${R}','r@example.com',now()-interval '200 days',now()-interval '90 days');`);
    await db.exec(await migration("20260910190000_create_app_administration.sql"));
    await db.query("SELECT bootstrap_app_administrator($1,$2)", [A, "AdminA"]);
    await db.query("UPDATE auth.users SET encrypted_password='a' WHERE id=$1", [A]);
    await db.exec(await migration("20260911190000_app_user_management.sql"));
    await db.exec(await migration("20260914190000_admin_round_search.sql"));
    await db.exec(await migration("20260929100000_admin_metrics.sql"));
    await db.exec(await migration("20260929110000_admin_metric_segments.sql"));
    await db.exec(`
 INSERT INTO user_profiles(user_id,nick,display_name) VALUES('${P}','PlayerP','Player P'),('${Q}','PlayerQ','Player Q'),('${R}','PlayerR','Player R');
 INSERT INTO user_subscriptions(user_id,plan_type,status,current_period_end) VALUES('${P}','player','active',now()+interval '3 days');
 INSERT INTO golf_courses VALUES('${C}','El Saler');
 INSERT INTO tees VALUES('${T}','${C}','Amarillas');
 INSERT INTO groups(id,name,group_code,user_auth_id) VALUES('${G}','Los del Sábado','SAB01','${P}');
 INSERT INTO group_members VALUES('${G}','${P}','admin',now()),('${G}','${R}','member',now());
 INSERT INTO group_invitations VALUES('${G}','${Q}','${P}','pending',now()-interval '20 days'),('${G}','${R}','${P}','accepted',now()-interval '5 days');
 INSERT INTO players(id,group_id,name,auth_user_id,is_guest) VALUES
  ('40000000-0000-4000-8000-000000000001','${G}','P','${P}',false),
  ('40000000-0000-4000-8000-000000000002','${G}','R','${R}',false),
  ('40000000-0000-4000-8000-000000000003','${G}','Invitado',NULL,true);
 INSERT INTO golf_rounds(id,course_id,tee_id,group_id,user_id,num_holes,holes_range,status,game_mode,created_at,admin_withdrawn_at) VALUES
  ('50000000-0000-4000-8000-000000000001','${C}','${T}','${G}','anon_1',18,NULL,'completed','stableford',now()-interval '2 days',NULL),
  ('50000000-0000-4000-8000-000000000002','${C}',NULL,NULL,'anon_1',9,'1-9','completed','parejas',now()-interval '3 days',NULL),
  ('50000000-0000-4000-8000-000000000003','${C}',NULL,'${G}','anon_1',18,NULL,'completed','stableford',now()-interval '4 days',now()),
  ('50000000-0000-4000-8000-000000000004','${C}',NULL,'${G}','anon_2',18,NULL,'archived','match',now()-interval '100 days',NULL),
  ('50000000-0000-4000-8000-000000000005','${C}',NULL,NULL,'anon_3',18,NULL,'active','stableford',now(),NULL);
 INSERT INTO round_players(round_id,player_id,user_id,name) VALUES
  ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',NULL,'P'),
  ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003',NULL,'Invitado'),
  ('50000000-0000-4000-8000-000000000002',NULL,'${P}','P'),
  ('50000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000002',NULL,'R'),
  ('50000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000002',NULL,'R');
 INSERT INTO pro_shop_purchases VALUES('${G}','premium_branding','completed',5,now(),NULL);`);
    const as = async (id) => {
      await db.exec("RESET ROLE");
      await db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: id })]);
      await db.exec("SET ROLE authenticated");
    };
    const one = async (sql, params = []) => (await db.query(sql, params)).rows[0].d;

    await as(P);
    for (const call of ["admin_metrics_overview(30)", `admin_user_insights('${P}')`, "admin_list_groups()", `admin_get_group('${G}')`, "admin_metric_segment('never_played')"])
      await assert.rejects(db.query(`SELECT ${call}`), /denegado/);
    await assert.rejects(db.query("SELECT admin_metric_players()"), /permission denied/);

    await as(A);
    await assert.rejects(db.query("SELECT admin_metrics_overview(14)"), /Periodo inválido/);
    const o = await one("SELECT admin_metrics_overview(30) AS d");
    assert.deepEqual(o.users, { total: 3, new: 1, with_round: 1, signed_in: 1, plans: { express: 2, player: 1, team: 0 } });
    assert.deepEqual(o.rounds, { played: 2, quick: 1, group: 1, nine_holes: 1, in_progress: 1 });
    assert.equal(o.weekly.length, 12);
    assert.equal(o.weekly.reduce((s, w) => s + w.quick + w.group, 0), 2);
    assert.deepEqual(o.modes, [{ mode: "parejas", count: 1 }, { mode: "stableford", count: 1 }]);
    assert.deepEqual(o.courses, [{ course: "El Saler", count: 2 }]);
    assert.deepEqual(o.frequency, { weekly: 0, few_per_month: 0, monthly: 0, occasional: 1 });
    assert.deepEqual(o.groups, { total: 1, new: 1, active: 1, avg_members: 2.0 });
    assert.deepEqual(o.invitations, { sent: 2, accepted: 1, pending_stale: 1 });
    assert.deepEqual(o.attention, { inactive_60: 1, never_played: 1, expiring_7: 1 });

    // Each list names exactly the people behind the matching Panel count.
    await assert.rejects(db.query("SELECT admin_metric_segment('todos')"), /Segmento inválido/);
    const segment = (name) => one("SELECT admin_metric_segment($1) AS d", [name]);
    for (const [name, count, nick] of [["inactive_60", o.attention.inactive_60, "PlayerR"], ["never_played", o.attention.never_played, "PlayerQ"],
      ["expiring_7", o.attention.expiring_7, "PlayerP"], ["stale_invitations", o.invitations.pending_stale, "PlayerQ"]]) {
      const s = await segment(name);
      assert.equal(s.total, count, name);
      assert.deepEqual(s.rows.map((r) => r.nick), [nick], name);
      assert.ok(!("ord" in s.rows[0]) && !("sort_at" in s.rows[0]), name);
    }
    assert.equal((await segment("expiring_7")).rows[0].email, "p@example.com");
    assert.ok((await segment("inactive_60")).rows[0].last_round_at);
    const stale = (await segment("stale_invitations")).rows[0];
    assert.deepEqual([stale.group_name, stale.invited_by_nick, stale.user_id], ["Los del Sábado", "PlayerP", Q]);

    const i = await one("SELECT admin_user_insights($1) AS d", [P]);
    assert.equal(i.rounds.played, 2);
    assert.equal(i.rounds.quick, 1);
    assert.equal(i.rounds.group, 1);
    assert.equal(i.weekly.length, 26);
    assert.equal(i.groups_created, 1);
    assert.equal(i.groups.length, 1);
    assert.equal(i.groups[0].owner, true);
    assert.equal(i.groups[0].rounds, 1);
    assert.deepEqual(i.invitations_sent, { total: 2, accepted: 1, pending: 1 });
    assert.deepEqual(i.courses.map((c) => `${c.tee ?? "-"} ${c.holes}`).sort(), ["- Hoyos 1-9", "Amarillas 18 hoyos"]);
    await assert.rejects(db.query("SELECT admin_user_insights($1)", [A]), /no encontrado/);

    const groups = await one("SELECT admin_list_groups() AS d");
    assert.equal(groups.total, 1);
    assert.equal(groups.groups[0].owner_nick, "PlayerP");
    assert.deepEqual([groups.groups[0].members, groups.groups[0].guests, groups.groups[0].rounds, groups.groups[0].rounds_30], [2, 1, 2, 1]);
    assert.equal((await one("SELECT admin_list_groups('sabado') AS d")).total, 1);
    assert.equal((await one("SELECT admin_list_groups('inexistente') AS d")).total, 0);

    const g = await one("SELECT admin_get_group($1) AS d", [G]);
    assert.equal(g.members.length, 2);
    assert.deepEqual(Object.fromEntries(g.members.map((m) => [m.nick, m.rounds])), { PlayerP: 1, PlayerR: 1 });
    assert.equal(g.guests, 1);
    assert.equal(g.rounds.played, 2);
    assert.deepEqual(g.invitations, { pending: 1, accepted: 1, rejected: 0 });
    assert.equal(g.purchases.length, 1);

    const users = await one("SELECT admin_list_app_users() AS d");
    assert.equal(users.total, 3);
    const byNick = Object.fromEntries(users.users.map((u) => [u.nick, u]));
    assert.deepEqual([byNick.PlayerP.rounds_played, byNick.PlayerP.groups_count], [2, 1]);
    assert.deepEqual([byNick.PlayerQ.rounds_played, byNick.PlayerQ.last_round_at], [0, null]);
    assert.deepEqual(users.users.map((u) => u.nick), ["PlayerQ", "PlayerP", "PlayerR"]);
  } finally {
    await db.close();
  }
});
