import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL(
  '../supabase/migrations/20261007100000_express_round_finisher.sql',
  import.meta.url,
), 'utf8');
const creatorOnlyMigration = await readFile(new URL(
  '../supabase/migrations/20261008130000_creator_only_round_completion.sql',
  import.meta.url,
), 'utf8');

test('only the creator can finish an Express round', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
        $$SELECT nullif(current_setting('request.uid', true), '')::uuid$$;
      CREATE FUNCTION public.is_app_administrator() RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE user_profiles(user_id uuid PRIMARY KEY, display_name text, nick text);
      CREATE TABLE golf_rounds(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL,
        group_id uuid, status text NOT NULL, access_code text NOT NULL,
        completed_at timestamptz, updated_at timestamptz DEFAULT now()
      );
    `);
    await db.exec(migration);
    await db.exec(creatorOnlyMigration);
    const inserted = await db.query("INSERT INTO golf_rounds(user_id,status,access_code) VALUES('creator','active','ABCD') RETURNING id");
    const round = inserted.rows[0].id;

    await db.query("SELECT register_express_round_access($1,'ABCD','guest')", [round]);
    await assert.rejects(db.query("SELECT finish_express_round($1,'stranger')", [round]), /Solo el creador/);
    await db.query("SELECT set_express_round_responsible($1,'guest','creator')", [round]);
    await assert.rejects(db.query("SELECT finish_express_round($1,'guest')", [round]), /Solo el creador/);
    await db.query("SELECT finish_express_round($1,'creator')", [round]);
    assert.equal((await db.query('SELECT status FROM golf_rounds WHERE id=$1', [round])).rows[0].status, 'completed');
  } finally {
    await db.close();
  }
});

test('only the creator can finish a group round', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$;
      CREATE FUNCTION public.is_app_administrator() RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE user_profiles(user_id uuid PRIMARY KEY, display_name text, nick text);
      CREATE TABLE golf_rounds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL, group_id uuid, status text NOT NULL, access_code text NOT NULL, completed_at timestamptz, updated_at timestamptz DEFAULT now());
    `);
    await db.exec(migration);
    await db.exec(creatorOnlyMigration);
    const inserted = await db.query("INSERT INTO golf_rounds(user_id,group_id,status,access_code) VALUES('owner',gen_random_uuid(),'active','TEAM') RETURNING id");
    const round = inserted.rows[0].id;
    await assert.rejects(db.query("SELECT finish_round($1,'member')", [round]), /Solo el creador/);
    await db.query("SELECT finish_round($1,'owner')", [round]);
    assert.equal((await db.query('SELECT status FROM golf_rounds')).rows[0].status, 'completed');
  } finally {
    await db.close();
  }
});
