import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL(
  '../supabase/migrations/20261015100000_claim_device_rounds.sql',
  import.meta.url,
), 'utf8');

const ACCOUNT = '00000000-0000-4000-8000-000000000031';
const DEVICE = 'anon_11111111-2222-4333-8444-555555555555';
const OTHER_DEVICE = 'anon_99999999-2222-4333-8444-555555555555';

const setup = async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$SELECT nullif(current_setting('request.uid', true), '')::uuid$$;
    CREATE TABLE app_administrators(user_id uuid PRIMARY KEY);
    CREATE TABLE app_user_restrictions(user_id uuid PRIMARY KEY, read_only boolean NOT NULL DEFAULT false);
    CREATE TABLE golf_rounds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL,
      group_id uuid, updated_at timestamptz DEFAULT now());
    CREATE TABLE completed_rounds_summary(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL);
  `);
  await db.exec(migration);
  await db.query(
    `INSERT INTO golf_rounds(user_id, group_id) VALUES ($1, NULL), ($1, NULL), ($1, gen_random_uuid()), ($2, NULL)`,
    [DEVICE, OTHER_DEVICE],
  );
  await db.query('INSERT INTO completed_rounds_summary(user_id) VALUES ($1), ($2)', [DEVICE, OTHER_DEVICE]);
  return db;
};
const asAccount = (db, uid = ACCOUNT) => db.query("SELECT set_config('request.uid', $1, false)", [uid]);
const owners = async (db, table) => (await db.query(`SELECT user_id, count(*)::int AS n FROM ${table} GROUP BY user_id ORDER BY user_id`)).rows;

test('a new account takes over the quick rounds created on its device', async () => {
  const db = await setup();
  try {
    await asAccount(db);
    const moved = (await db.query('SELECT public.claim_device_rounds($1) AS n', [DEVICE])).rows[0].n;
    assert.equal(moved, 2, 'only the two quick rounds of this device move');
    const rounds = await owners(db, 'golf_rounds');
    assert.deepEqual(rounds.find(r => r.user_id === ACCOUNT)?.n, 2);
    assert.deepEqual(rounds.find(r => r.user_id === DEVICE)?.n, 1, 'group rounds stay where they were');
    assert.deepEqual(rounds.find(r => r.user_id === OTHER_DEVICE)?.n, 1, 'other devices are untouched');
    const summaries = await owners(db, 'completed_rounds_summary');
    assert.deepEqual(summaries.find(r => r.user_id === ACCOUNT)?.n, 1);
    assert.equal((await db.query('SELECT public.claim_device_rounds($1) AS n', [DEVICE])).rows[0].n, 0, 'claiming again is harmless');
  } finally {
    await db.close();
  }
});

test('claiming requires a session and a real device identifier', async () => {
  const db = await setup();
  try {
    await asAccount(db, '');
    await assert.rejects(db.query('SELECT public.claim_device_rounds($1)', [DEVICE]), /Inicia sesión/);
    await asAccount(db);
    for (const value of ['00000000-0000-4000-8000-000000000099', 'anon_', "anon_x' OR '1'='1", '']) {
      await assert.rejects(db.query('SELECT public.claim_device_rounds($1)', [value]), /no válido/, value);
    }
  } finally {
    await db.close();
  }
});

test('read-only and administrator accounts never take rounds', async () => {
  const db = await setup();
  try {
    await db.query('INSERT INTO app_user_restrictions(user_id, read_only) VALUES ($1, true)', [ACCOUNT]);
    await asAccount(db);
    assert.equal((await db.query('SELECT public.claim_device_rounds($1) AS n', [DEVICE])).rows[0].n, 0);
    assert.equal((await owners(db, 'golf_rounds')).find(r => r.user_id === ACCOUNT), undefined);
  } finally {
    await db.close();
  }
});
