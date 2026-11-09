import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createGroupDatabase } from './helpers/group-database.mjs';

const migration = async (db, file) => db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));

async function setup() {
  const db = new PGlite();
  await createGroupDatabase(db);
  await db.exec('ALTER TABLE groups ADD COLUMN hoyo_19_enabled boolean DEFAULT false, ADD COLUMN archived_at timestamptz;');
  const [owner, member, group, otherGroup, foreignGroup, outsider] = Array.from({ length: 6 }, randomUUID);
  await db.query('INSERT INTO auth.users VALUES($1),($2),($3)', [owner, member, outsider]);
  await db.query('INSERT INTO groups(id,user_auth_id,hoyo_19_enabled) VALUES($1,$2,true),($3,$2,false),($4,$5,false)', [group, owner, otherGroup, foreignGroup, outsider]);
  await db.query("INSERT INTO group_members(group_id,user_id,role) VALUES($1,$2,'member')", [group, member]);
  await db.exec('GRANT USAGE ON SCHEMA public,auth TO anon,authenticated; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO anon,authenticated;');
  // Como en producción (20260915210000_group_messages): helper interno, no ejecutable con sesión.
  await db.exec('REVOKE ALL ON FUNCTION can_manage_group_messages(uuid) FROM PUBLIC, anon, authenticated;');
  for (const file of ['20261109120000_group_gamification.sql', '20261109130000_activate_group_gamification.sql', '20261109140000_fix_group_gamification_selection.sql', '20261109150000_group_gamification_rls_helper.sql']) {
    await migration(db, file);
  }
  const as = async id => {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.uid',$1,false)", [id || '']);
    await db.exec(`SET ROLE ${id ? 'authenticated' : 'anon'}`);
  };
  const rows = async groupId => {
    await db.exec('RESET ROLE');
    return (await db.query('SELECT product_id, purchased, enabled FROM group_gamification WHERE group_id=$1 ORDER BY product_id', [groupId])).rows;
  };
  const save = (groupId, ids) => db.query('SELECT activate_group_gamification($1,$2)', [groupId, ids]);
  return { db, owner, member, outsider, group, otherGroup, foreignGroup, as, rows, save };
}

test('Pro-Shop selection is saved only in the chosen group and deselected titles are withdrawn', async () => {
  const { db, owner, group, otherGroup, as, rows, save } = await setup();
  try {
    await as(owner);
    await save(group, ['spanish-hand', 'buceador', 'minero']);
    const saved = await rows(group);
    assert.deepEqual(saved.filter(r => r.purchased).map(r => r.product_id).sort(), ['buceador', 'minero', 'no-paso-rojas', 'spanish-hand']);
    assert.ok(saved.filter(r => r.purchased).every(r => r.enabled));
    // El otro grupo del mismo creador no recibe la selección.
    assert.deepEqual((await rows(otherGroup)).filter(r => r.purchased).map(r => r.product_id).sort(), ['no-paso-rojas', 'spanish-hand']);

    // Desactivado en Configuración del grupo: volver a guardar en el Pro-Shop lo respeta.
    await as(owner);
    await db.query("UPDATE group_gamification SET enabled=false, updated_by=$2 WHERE group_id=$1 AND product_id='minero'", [group, owner]);
    await save(group, ['spanish-hand', 'buceador', 'minero', 'lumberjack']);
    const afterResave = Object.fromEntries((await rows(group)).map(r => [r.product_id, r]));
    assert.equal(afterResave.minero.enabled, false);
    assert.equal(afterResave.lumberjack.enabled, true);

    // Desmarcar en el Pro-Shop retira el título (Rojas, incluido gratis, se queda).
    await as(owner);
    await save(group, ['lumberjack']);
    const afterRemove = Object.fromEntries((await rows(group)).map(r => [r.product_id, r]));
    assert.equal(afterRemove.buceador.purchased, false);
    assert.equal(afterRemove['spanish-hand'].purchased, false);
    assert.equal(afterRemove.lumberjack.purchased, true);
    assert.equal(afterRemove['no-paso-rojas'].purchased, true);

    // Y se puede guardar sin ningún título de pago.
    await as(owner);
    await save(group, []);
    assert.deepEqual((await rows(group)).filter(r => r.purchased).map(r => r.product_id), ['no-paso-rojas']);
  } finally { await db.close(); }
});

test('signed-in creator and members can read the group titles, and the creator can toggle them', async () => {
  const { db, owner, member, outsider, group, as, save } = await setup();
  try {
    await as(owner);
    await save(group, ['buceador']);
    const read = async () => (await db.query('SELECT product_id, enabled FROM group_gamification WHERE group_id=$1 AND purchased ORDER BY product_id', [group])).rows.map(r => r.product_id);
    await as(owner);
    assert.deepEqual(await read(), ['buceador', 'no-paso-rojas']);
    await as(member);
    assert.deepEqual(await read(), ['buceador', 'no-paso-rojas']);
    await as(outsider);
    assert.deepEqual(await read(), []);

    // Panel de Configuración del grupo (update directo con RLS).
    await as(owner);
    const updated = await db.query("UPDATE group_gamification SET enabled=false, updated_by=$2 WHERE group_id=$1 AND product_id='buceador' RETURNING enabled", [group, owner]);
    assert.equal(updated.rows.length, 1);
    await as(member);
    const blocked = await db.query("UPDATE group_gamification SET enabled=true, updated_by=$2 WHERE group_id=$1 AND product_id='buceador' RETURNING enabled", [group, member]);
    assert.equal(blocked.rows.length, 0);
  } finally { await db.close(); }
});

test('only the group creator can save, and only catalog titles are accepted', async () => {
  const { db, owner, member, outsider, group, foreignGroup, as, save } = await setup();
  try {
    await as(member);
    await assert.rejects(save(group, ['buceador']), /Solo el creador/);
    await as(outsider);
    await assert.rejects(save(group, ['buceador']), /Solo el creador/);
    await as(owner);
    await assert.rejects(save(foreignGroup, ['buceador']), /Solo el creador/);
    await as(owner);
    await assert.rejects(save(group, ['no-paso-rojas']), /no válido/);
    await as(null);
    await assert.rejects(save(group, ['buceador']), /permission denied|Solo el creador/);
  } finally { await db.close(); }
});

test('No paso de Rojas toggled in group settings updates hoyo_19_enabled, and new groups get defaults', async () => {
  const { db, owner, group, as, rows } = await setup();
  try {
    await as(owner);
    await db.query("UPDATE group_gamification SET enabled=false, updated_by=$2 WHERE group_id=$1 AND product_id='no-paso-rojas'", [group, owner]);
    await db.exec('RESET ROLE');
    assert.equal((await db.query('SELECT hoyo_19_enabled FROM groups WHERE id=$1', [group])).rows[0].hoyo_19_enabled, false);

    const fresh = randomUUID();
    await db.query('INSERT INTO groups(id,user_auth_id,hoyo_19_enabled) VALUES($1,$2,true)', [fresh, owner]);
    assert.deepEqual(await rows(fresh), [
      { product_id: 'no-paso-rojas', purchased: true, enabled: true },
      { product_id: 'spanish-hand', purchased: true, enabled: true },
    ]);
  } finally { await db.close(); }
});
