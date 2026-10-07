import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL(
  '../supabase/migrations/20261006100000_registered_round_owner_guard.sql',
  import.meta.url,
), 'utf8');

const ACCOUNT = '00000000-0000-4000-8000-000000000021';

test('registered round ownership always follows the authenticated account', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
        $$SELECT nullif(current_setting('request.uid', true), '')::uuid$$;
      CREATE TABLE golf_rounds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL, status text);
      CREATE TABLE completed_rounds_summary(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL);
    `);
    await db.exec(migration);

    await db.query("SELECT set_config('request.uid', $1, false)", [ACCOUNT]);
    await db.exec("INSERT INTO golf_rounds(user_id,status) VALUES('device_from_phone','active')");
    await db.exec("INSERT INTO completed_rounds_summary(user_id) VALUES('device_from_phone')");

    assert.equal((await db.query('SELECT user_id FROM golf_rounds')).rows[0].user_id, ACCOUNT);
    assert.equal((await db.query('SELECT user_id FROM completed_rounds_summary')).rows[0].user_id, ACCOUNT);

    await db.exec("UPDATE golf_rounds SET user_id='reassigned_by_admin'");
    assert.equal((await db.query('SELECT user_id FROM golf_rounds')).rows[0].user_id, 'reassigned_by_admin');

    await db.query("SELECT set_config('request.uid', '', false)");
    await db.exec("INSERT INTO golf_rounds(user_id,status) VALUES('anonymous_device','active')");
    const anonymous = await db.query("SELECT user_id FROM golf_rounds WHERE user_id='anonymous_device'");
    assert.equal(anonymous.rows.length, 1);
  } finally {
    await db.close();
  }
});
