import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL(
  '../supabase/migrations/20261008110000_message_recipient_deletion.sql',
  import.meta.url,
), 'utf8');

test('a recipient deletes one or all own deliveries without affecting other recipients', async () => {
  const db = new PGlite();
  const userA = '11111111-1111-4111-8111-111111111111';
  const userB = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
        $$SELECT nullif(current_setting('request.uid', true), '')::uuid$$;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE app_message_boxes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), secret_hash text UNIQUE);
      CREATE TABLE app_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE app_message_deliveries(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id uuid NOT NULL REFERENCES app_messages(id),
        kind text NOT NULL, recipient_id uuid NOT NULL, read_at timestamptz, sent_at timestamptz DEFAULT now()
      );
    `);
    await db.exec(migration);
    const message = (await db.query('INSERT INTO app_messages DEFAULT VALUES RETURNING id')).rows[0].id;
    const deliveryA1 = (await db.query(
      "INSERT INTO app_message_deliveries(message_id,kind,recipient_id) VALUES($1,'user',$2) RETURNING id",
      [message, userA],
    )).rows[0].id;
    await db.query("INSERT INTO app_message_deliveries(message_id,kind,recipient_id) VALUES($1,'user',$2),($1,'user',$3)", [message, userA, userB]);

    await db.exec(`SET request.uid = '${userA}'`);
    await db.query('SELECT my_message_delete($1)', [deliveryA1]);
    assert.equal(Number((await db.query('SELECT count(*) n FROM app_message_deliveries WHERE recipient_id=$1', [userA])).rows[0].n), 1);
    assert.equal(Number((await db.query('SELECT count(*) n FROM app_message_deliveries WHERE recipient_id=$1', [userB])).rows[0].n), 1);

    assert.equal((await db.query('SELECT my_message_delete_all() n')).rows[0].n, 1);
    assert.equal(Number((await db.query('SELECT count(*) n FROM app_message_deliveries WHERE recipient_id=$1', [userB])).rows[0].n), 1);
  } finally {
    await db.close();
  }
});

test('an Express secret deletes only its own mailbox deliveries', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE app_message_boxes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), secret_hash text UNIQUE);
      CREATE TABLE app_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE app_message_deliveries(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id uuid NOT NULL REFERENCES app_messages(id),
        kind text NOT NULL, recipient_id uuid NOT NULL, read_at timestamptz, sent_at timestamptz DEFAULT now()
      );
    `);
    await db.exec(migration);
    const box = (await db.query("INSERT INTO app_message_boxes(secret_hash) VALUES('good') RETURNING id")).rows[0].id;
    const other = (await db.query("INSERT INTO app_message_boxes(secret_hash) VALUES('other') RETURNING id")).rows[0].id;
    const message = (await db.query('INSERT INTO app_messages DEFAULT VALUES RETURNING id')).rows[0].id;
    await db.query("INSERT INTO app_message_deliveries(message_id,kind,recipient_id) VALUES($1,'express',$2),($1,'express',$3)", [message, box, other]);

    await assert.rejects(db.query("SELECT express_message_delete($1,'bad',NULL)", [box]), /Buzón no disponible/);
    assert.equal((await db.query("SELECT express_message_delete($1,'good',NULL) n", [box])).rows[0].n, 1);
    assert.equal(Number((await db.query('SELECT count(*) n FROM app_message_deliveries WHERE recipient_id=$1', [other])).rows[0].n), 1);
  } finally {
    await db.close();
  }
});
