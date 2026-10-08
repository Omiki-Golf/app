import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(
  new URL('../supabase/migrations/20261008120000_fix_round_deletion_admin_permission.sql', import.meta.url),
  'utf8',
);

test('an Express user can delete an incomplete round without administrator function access', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
        $$ SELECT nullif(current_setting('request.uid', true), '')::uuid $$;
      CREATE TABLE app_administrators(user_id uuid, status text);
      CREATE FUNCTION is_app_administrator() RETURNS boolean LANGUAGE sql SECURITY DEFINER AS
        $$ SELECT EXISTS (SELECT 1 FROM app_administrators WHERE user_id=auth.uid() AND status='active') $$;
      CREATE TABLE golf_rounds(
        id uuid PRIMARY KEY,
        user_id text,
        group_id uuid,
        status text,
        responsible_user_id text,
        admin_withdrawn_at timestamptz,
        admin_previous_status text,
        updated_at timestamptz DEFAULT now()
      );
    `);

    // Create the old trigger functions before replacing them with the fix.
    await db.exec(`
      CREATE OR REPLACE FUNCTION guard_round_admin_fields() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN PERFORM is_app_administrator(); RETURN NEW; END $$;
      CREATE OR REPLACE FUNCTION guard_express_round_completion() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN PERFORM is_app_administrator(); RETURN NEW; END $$;
      CREATE TRIGGER guard_admin BEFORE INSERT OR UPDATE ON golf_rounds
        FOR EACH ROW EXECUTE FUNCTION guard_round_admin_fields();
      CREATE TRIGGER guard_finish BEFORE UPDATE OF status ON golf_rounds
        FOR EACH ROW EXECUTE FUNCTION guard_express_round_completion();
      GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
      GRANT SELECT, INSERT, UPDATE ON golf_rounds TO anon, authenticated;
      REVOKE ALL ON FUNCTION is_app_administrator() FROM PUBLIC, anon, authenticated;
    `);
    await db.exec(migration);
    const roundId = '00000000-0000-4000-8000-000000000001';
    await db.query(
      `INSERT INTO golf_rounds(id,user_id,status) VALUES($1,'anon_device','active')`,
      [roundId],
    );
    await db.exec('SET ROLE anon');
    await db.query(`UPDATE golf_rounds SET status='deleted' WHERE id=$1`, [roundId]);
    await db.exec('RESET ROLE');
    const result = await db.query('SELECT status FROM golf_rounds WHERE id=$1', [roundId]);
    assert.equal(result.rows[0].status, 'deleted');
  } finally {
    await db.close();
  }
});
