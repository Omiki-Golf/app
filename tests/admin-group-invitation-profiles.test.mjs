import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../supabase/migrations/20261022150000_group_invitation_profiles.sql', import.meta.url), 'utf8');

test('group managers list invitations with the invited profiles; others see nothing', async () => {
  const db = new PGlite();
  const [owner, admin, invited, rejected, outsider, group] = Array.from({ length: 6 }, () => randomUUID());
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.uid', true), '')::uuid$$;
      CREATE TABLE groups(id uuid PRIMARY KEY, user_auth_id uuid);
      CREATE TABLE group_members(group_id uuid, user_id uuid, role text, PRIMARY KEY(group_id, user_id));
      CREATE TABLE group_invitations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), group_id uuid, invited_user_id uuid, invited_by uuid, status text, created_at timestamptz DEFAULT now());
      CREATE TABLE user_profiles(user_id uuid PRIMARY KEY, nick text, display_name text, avatar_url text, exact_handicap numeric);
      ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
      CREATE POLICY select_own_profile ON user_profiles FOR SELECT USING (auth.uid() = user_id);
      GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
      GRANT SELECT ON user_profiles TO authenticated;
      INSERT INTO groups VALUES ('${group}', '${owner}');
      INSERT INTO group_members VALUES ('${group}', '${owner}', 'admin'), ('${group}', '${admin}', 'admin');
      INSERT INTO user_profiles VALUES ('${invited}', 'FedePlaye2', NULL, 'avatar.png', 0), ('${rejected}', 'Kikeplayer04', NULL, NULL, 24);
      INSERT INTO group_invitations(group_id, invited_user_id, invited_by, status, created_at) VALUES
        ('${group}', '${invited}', '${owner}', 'pending', now()),
        ('${group}', '${rejected}', '${owner}', 'rejected', now() + interval '1 second');
    `);
    await db.exec(migration);

    const as = async (id) => {
      await db.exec('RESET ROLE');
      await db.query("SELECT set_config('request.uid', $1, false)", [id || '']);
      await db.exec(`SET ROLE ${id ? 'authenticated' : 'anon'}`);
    };
    const list = async () => (await db.query('SELECT * FROM list_group_invitations($1)', [group])).rows;

    // El cliente no puede leer perfiles ajenos directamente: era la causa del fallo.
    await as(owner);
    assert.equal((await db.query('SELECT * FROM user_profiles')).rows.length, 0);

    const rows = await list();
    assert.deepEqual(rows.map((row) => [row.nick, row.status]), [['FedePlaye2', 'pending'], ['Kikeplayer04', 'rejected']]);
    assert.equal(rows[0].avatar_url, 'avatar.png');

    await as(admin);
    assert.equal((await list()).length, 2);

    await as(outsider);
    assert.equal((await list()).length, 0);

    await as(null);
    await assert.rejects(list(), /permission denied/);
  } finally {
    await db.close();
  }
});
