import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('group round setup only offers Stableford and always creates Stableford rounds', async () => {
  const source = await read('../src/components/RoundSetup.tsx');
  assert.match(source, /const groupStablefordOnly = Boolean\(currentGroup\);/);
  // Sin grupo (partida rápida) siguen las cuatro modalidades; con grupo, una pastilla fija.
  assert.match(source, /\{groupStablefordOnly \? \([\s\S]*roundSetup\.groupStablefordOnly[\s\S]*\) : \([\s\S]*handleGameModeClick\('match'\)/);
  assert.match(source, /groupStablefordOnly \? 'stableford' : gameMode,/);
  assert.match(source, /isExpress \|\| groupStablefordOnly\) return;/);
  const i18n = await read('../src/i18n/index.ts');
  assert.equal((i18n.match(/groupStablefordOnly: '/g) || []).length, 4);
});

test('the database rejects group rounds in other modes and keeps quick rounds open', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE golf_rounds(id uuid PRIMARY KEY, group_id uuid, game_mode text DEFAULT \'stableford\');');
    await db.exec(await read('../supabase/migrations/20261127100000_group_rounds_stableford_only.sql'));
    const group = randomUUID();
    const insert = (groupId, mode) => db.query('INSERT INTO golf_rounds(id, group_id, game_mode) VALUES($1,$2,$3) RETURNING id', [randomUUID(), groupId, mode]);

    await assert.rejects(insert(group, 'match'), /siempre a Stableford/);
    await assert.rejects(insert(group, 'parejas'), /siempre a Stableford/);
    const groupRound = (await insert(group, 'stableford')).rows[0].id;
    for (const mode of ['stableford', 'match', 'sindicato', 'parejas']) await insert(null, mode);

    await assert.rejects(db.query("UPDATE golf_rounds SET game_mode='sindicato' WHERE id=$1", [groupRound]), /siempre a Stableford/);
    const quickMatch = (await db.query("SELECT id FROM golf_rounds WHERE group_id IS NULL AND game_mode='match'")).rows[0].id;
    await assert.rejects(db.query('UPDATE golf_rounds SET group_id=$1 WHERE id=$2', [group, quickMatch]), /siempre a Stableford/);

    // Una partida de grupo antigua en otra modalidad no bloquea otros cambios.
    await db.exec('ALTER TABLE golf_rounds DISABLE TRIGGER guard_group_round_stableford');
    const legacy = (await insert(group, 'match')).rows[0].id;
    await db.exec('ALTER TABLE golf_rounds ENABLE TRIGGER guard_group_round_stableford');
    await db.exec('ALTER TABLE golf_rounds ADD COLUMN status text');
    await db.query("UPDATE golf_rounds SET status='completed' WHERE id=$1", [legacy]);
  } finally {
    await db.close();
  }
});
