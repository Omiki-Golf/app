import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../supabase/migrations/20261008140000_spanish_course_catalog.sql', import.meta.url), 'utf8');

test('Spanish catalog migration installs every playable route idempotently', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE golf_courses(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL UNIQUE,
        description text,
        created_at timestamptz DEFAULT now()
      );
      CREATE TABLE golf_holes(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        course_id uuid NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
        hole_number integer NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
        par integer NOT NULL CHECK (par BETWEEN 3 AND 5),
        stroke_index integer NOT NULL CHECK (stroke_index BETWEEN 1 AND 18),
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        UNIQUE(course_id, hole_number)
      );
    `);
    await db.exec(migration);
    await db.exec(migration);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM golf_courses WHERE catalog_key IS NOT NULL')).rows[0].count, 895);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM golf_holes')).rows[0].count, 16110);
    assert.equal((await db.query('SELECT max(par)::int AS value FROM golf_holes')).rows[0].value, 6);
    assert.equal((await db.query('SELECT count(DISTINCT catalog_key)::int AS count FROM golf_courses')).rows[0].count, 895);
  } finally {
    await db.close();
  }
});
