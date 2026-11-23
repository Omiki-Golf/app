import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('only the group creator can rename an active group', async () => {
  const db = new PGlite();
  const owner = randomUUID();
  const other = randomUUID();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE TABLE public.current_user_id(id uuid);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT id FROM public.current_user_id LIMIT 1';
      CREATE FUNCTION public.is_app_user_read_only() RETURNS boolean LANGUAGE sql AS 'SELECT false';
      CREATE TABLE public.groups(id uuid PRIMARY KEY, name text NOT NULL, user_auth_id uuid, archived_at timestamptz);
    `);
    await db.exec(await read('../supabase/migrations/20261128100000_rename_owned_group.sql'));
    const group = randomUUID();
    const archived = randomUUID();
    await db.query('INSERT INTO groups VALUES($1,$2,$3,NULL),($4,$5,$3,now())', [group, 'Antiguo', owner, archived, 'Archivado']);
    const actAs = async id => {
      await db.query('DELETE FROM current_user_id');
      await db.query('INSERT INTO current_user_id VALUES($1)', [id]);
    };
    const rename = (id, name) => db.query('SELECT public.rename_owned_group($1,$2) AS name', [id, name]);

    await actAs(other);
    await assert.rejects(rename(group, 'Hackeado'), /Solo el creador/);

    await actAs(owner);
    assert.equal((await rename(group, '  Los del Domingo  ')).rows[0].name, 'Los del Domingo');
    assert.equal((await db.query('SELECT name FROM groups WHERE id=$1', [group])).rows[0].name, 'Los del Domingo');
    await assert.rejects(rename(group, '   '), /obligatorio/);
    await assert.rejects(rename(group, 'x'.repeat(61)), /60 caracteres/);
    await assert.rejects(rename(archived, 'Nuevo'), /archivado/);
  } finally {
    await db.close();
  }
});

test('group settings shows the rename field only to the creator', async () => {
  const groups = await read('../src/components/MyGroups.tsx');
  const panel = await read('../src/components/GroupSettingsPanel.tsx');
  assert.match(groups, /isOwner=\{group\.access === 'owner'\}/);
  assert.match(panel, /isOwner && \(/);
  assert.match(panel, /rename_owned_group/);
});
