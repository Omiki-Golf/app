import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const sql = await readFile(
  new URL(
    "../supabase/migrations/20260911190000_app_user_management.sql",
    import.meta.url,
  ),
  "utf8",
);
const first = await readFile(
  new URL(
    "../supabase/migrations/20260910190000_create_app_administration.sql",
    import.meta.url,
  ),
  "utf8",
);
const A = "00000000-0000-4000-8000-000000000001",
  P = "00000000-0000-4000-8000-000000000002",
  Q = "00000000-0000-4000-8000-000000000003";
test("user management: permissions, filters, atomic audit, plans and read-only writes including definer RPC", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,created_at timestamptz DEFAULT now(),encrypted_password text,raw_app_meta_data jsonb DEFAULT '{}',raw_user_meta_data jsonb DEFAULT '{}');
 CREATE TABLE user_profiles(user_id uuid UNIQUE,nick text UNIQUE,display_name text,avatar_url text,exact_handicap numeric,default_tee text,accepted_terms boolean,updated_at timestamptz DEFAULT now());
 CREATE TABLE user_subscriptions(user_id uuid UNIQUE,plan_type text NOT NULL,status text,payment_hash text,current_period_start timestamptz,current_period_end timestamptz,updated_at timestamptz);
 CREATE TABLE golf_rounds(id integer PRIMARY KEY,score integer);INSERT INTO golf_rounds VALUES(1,42);
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT current_setting('request.jwt.claims',true)::jsonb$$;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT (auth.jwt()->>'sub')::uuid$$;
 GRANT USAGE ON SCHEMA auth TO authenticated,anon;
 GRANT ALL ON golf_rounds,user_profiles,user_subscriptions TO authenticated,anon;
 CREATE FUNCTION public.legacy_write() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ UPDATE public.golf_rounds SET score=99 $$;
 INSERT INTO auth.users(id,email) VALUES('${A}','a+admin@example.com'),('${P}','p@example.com'),('${Q}','q@example.com');
 INSERT INTO user_profiles(user_id,nick,display_name,avatar_url,exact_handicap,default_tee,accepted_terms) VALUES('${P}','PlayerP','Player P','/avatars/leon.webp',12,'amarillo',true);`);
    await db.exec(first);
    await db.query("SELECT bootstrap_app_administrator($1,$2)", [A, "AdminA"]);
    await db.query("UPDATE auth.users SET encrypted_password='a' WHERE id=$1", [
      A,
    ]);
    await db.exec(sql);
    await db.exec(await readFile(new URL('../supabase/migrations/20260922120000_premium_subscription_plan.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../supabase/migrations/20260915190000_inapp_messages.sql', import.meta.url), 'utf8'));
    const as = async (id, role = "authenticated") => {
      await db.exec("RESET ROLE");
      await db.query("SELECT set_config('request.jwt.claims',$1,false)", [
        JSON.stringify({ sub: id }),
      ]);
      await db.exec(`SET ROLE ${role}`);
    };
    const detail = async (id) =>
      (await db.query("SELECT admin_get_app_user($1) AS d", [id])).rows[0].d;
    const change = async (id, action, values, expected = undefined) =>
      (
        await db.query("SELECT admin_update_app_user($1,$2,$3,$4,$5) AS d", [
          id,
          action,
          values,
          "Prueba administrativa",
          expected ?? (await detail(id)),
        ])
      ).rows[0].d;
    await as(P);
    await assert.rejects(detail(P), /denegado/);
    await assert.rejects(db.exec("SELECT admin_list_app_users()"), /denegado/);
    await assert.rejects(
      db.exec("UPDATE app_user_restrictions SET read_only=false"),
    );
    await as(A);
    assert.equal(
      (await db.query("SELECT admin_list_app_users() AS d")).rows[0].d.total,
      2,
    );
    assert.equal(
      (await db.query("SELECT admin_list_app_users('p@example.com') AS d"))
        .rows[0].d.total,
      1,
    );
    assert.equal(
      (await db.query("SELECT admin_list_app_users('not-found') AS d")).rows[0]
        .d.total,
      0,
    );
    await assert.rejects(detail(A), /no encontrado/);
    const original = await detail(P);
    await change(P, "plan", { plan: "team", end: null });
    assert.equal((await detail(P)).plan, "team");
    await assert.rejects(
      change(P, "restriction", { read_only: true }, original),
      /ha cambiado/,
    );
    await assert.rejects(
      change(P, "plan", { plan: "team", end: "2000-01-01" }),
      /futura/,
    );
    await change(P, "plan", { plan: "player", end: "2099-01-01" });
    assert.equal((await detail(P)).plan, "player");
    const data = {
      nick: "NewNick",
      display_name: "New Name",
      avatar_url: "/avatars/panda.webp",
      exact_handicap: 4.2,
      default_tee: "rojo",
    };
    await change(P, "profile", data);
    assert.equal((await detail(P)).profile.nick, "NewNick");
    await assert.rejects(change(Q, "profile", data), /completar/);
    await db.exec("RESET ROLE");
    await db.query(
      "INSERT INTO user_profiles(user_id,nick) VALUES($1,'Taken')",
      [Q],
    );
    await as(A);
    await assert.rejects(
      change(P, "profile", { ...data, nick: "Taken" }),
      /uso/,
    );
    await change(P, "restriction", { read_only: true });
    const messageId = '00000000-0000-4000-8000-000000000099';
    await db.query('SELECT admin_save_message($1,$2,$3,$4,0)', [messageId, 'Aviso', 'Puedes leer este aviso.', JSON.stringify([{kind:'user',id:P}])]);
    await db.query('SELECT admin_send_message($1,1)', [messageId]);
    assert.equal(
      (await db.query("SELECT admin_list_app_users('', '',true) AS d")).rows[0]
        .d.total,
      1,
    );
    await as(P);
    const inbox = (await db.query('SELECT my_message_inbox() AS d')).rows[0].d;
    assert.equal(inbox.unread, 1);
    await db.query('SELECT my_message_open($1)', [inbox.messages[0].id]);
    assert.equal((await db.query('SELECT my_message_inbox() AS d')).rows[0].d.unread, 0);
    assert.equal(
      (await db.query("SELECT is_app_user_read_only() AS b")).rows[0].b,
      true,
    );
    assert.equal(
      (await db.query("SELECT score FROM golf_rounds")).rows[0].score,
      42,
    );
    for (const statement of [
      "UPDATE golf_rounds SET score=77",
      "DELETE FROM golf_rounds",
      "INSERT INTO golf_rounds VALUES(2,2)",
      "TRUNCATE golf_rounds",
      "SELECT legacy_write()",
      "UPDATE user_profiles SET nick='escape'",
      "UPDATE user_subscriptions SET plan_type='team'",
    ])
      await assert.rejects(db.exec(statement), /solo lectura/);
    // Auth passwords are deliberately outside business write protection.
    await db.exec("RESET ROLE");
    await db.query(
      "UPDATE auth.users SET encrypted_password='recovered' WHERE id=$1",
      [P],
    );
    await as(A);
    await change(P, "restriction", { read_only: false });
    await as(P);
    await db.exec("UPDATE golf_rounds SET score=43");
    await as(null, "anon");
    await db.exec("UPDATE golf_rounds SET score=44");
    await as(A);
    await change(P, "plan", { plan: "express", end: null });
    assert.equal((await detail(P)).plan, "express");
    const logs = (
      await db.query(
        "SELECT * FROM list_app_admin_audit() WHERE action LIKE 'user.%'",
      )
    ).rows;
    assert.equal(logs.length, 6);
    assert.ok(
      logs.every(
        (e) =>
          e.actor_user_id === A &&
          e.target_user_id === P &&
          e.details.reason &&
          "before" in e.details &&
          "after" in e.details,
      ),
    );
    await change(P, 'plan', { plan: 'premium', end: '2099-01-01' });
    assert.equal((await detail(P)).plan, 'premium');
    assert.equal((await db.query("SELECT admin_list_app_users('', 'premium') AS d")).rows[0].d.total, 1);
    await as(P);
    await db.exec("UPDATE user_subscriptions SET plan_type='team',current_period_end=now()+interval '1 month'");
    await as(A);
    assert.equal((await detail(P)).plan, 'team');
    await db.exec("RESET ROLE");
    await db.exec("UPDATE user_subscriptions SET current_period_end=now()-interval '1 second'");
    await db.exec("INSERT INTO auth.users(id,email) SELECT gen_random_uuid(),'page-'||i||'@example.com' FROM generate_series(1,30) i");
    await as(A);
    assert.equal((await detail(P)).plan, 'express');
    const page0=(await db.query("SELECT admin_list_app_users('page-', '',null,0) AS d")).rows[0].d;
    const page1=(await db.query("SELECT admin_list_app_users('page-', '',null,1) AS d")).rows[0].d;
    assert.equal(page0.total,30);assert.equal(page0.users.length,25);assert.equal(page1.users.length,5);
    assert.equal(new Set([...page0.users,...page1.users].map(u=>u.user_id)).size,30);
    await db.exec("RESET ROLE");
    await db.query(
      "UPDATE app_administrators SET status='disabled' WHERE user_id=$1",
      [A],
    );
    await as(A);
    await assert.rejects(detail(P), /denegado/);
  } finally {
    await db.close();
  }
});
