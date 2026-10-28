import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Diagnostic reproduction of historical policies, not certification of remote state.
test('historical score policies alone do not reject a member write after completion', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260115104253_restore_structure_master.sql', import.meta.url), 'utf8');
  const policies = sql.match(/CREATE POLICY "Public can (?:view|insert|update|delete) scores"[^;]+;/g);
  assert.equal(policies.length, 4);
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE member;
      CREATE TABLE golf_rounds(id int PRIMARY KEY, user_id text, status text);
      CREATE TABLE round_scores(id int PRIMARY KEY, round_id int REFERENCES golf_rounds, gross_strokes int);
      INSERT INTO golf_rounds VALUES (1,'creator','active');
      INSERT INTO round_scores VALUES (1,1,5);
      ALTER TABLE round_scores ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA public TO member;
      GRANT SELECT,INSERT,UPDATE,DELETE ON round_scores TO member;
      ${policies.join('\n')}
      UPDATE golf_rounds SET status='completed' WHERE id=1;
      SET ROLE member;
      UPDATE round_scores SET gross_strokes=4 WHERE id=1;
      RESET ROLE;
    `);
    assert.equal((await db.query('SELECT gross_strokes FROM round_scores WHERE id=1')).rows[0].gross_strokes, 4);
  } finally { await db.close(); }
});
