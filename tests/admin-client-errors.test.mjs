import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

async function database() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE test_session(uid uuid);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT uid FROM public.test_session LIMIT 1 $$;
  `);
  await db.exec(await read('../supabase/migrations/20261206100000_client_errors.sql'));
  const as = async id => { await db.query('DELETE FROM test_session'); if (id) await db.query('INSERT INTO test_session VALUES($1)', [id]); };
  const log = (kind, message, url = 'https://app.omikigolf.com/?code=SECRET') =>
    db.query("SELECT public.log_client_error($1,$2,'stack','<App>','scorecard','1.6.1',$3,'UA',false)", [kind, message, url]);
  const rows = async () => (await db.query('SELECT * FROM client_errors ORDER BY id')).rows;
  return { db, as, log, rows };
}

test('client errors record the account, trim long text and drop query strings', async () => {
  const { as, log, rows } = await database();
  const user = crypto.randomUUID();
  await as(user);
  await log('render', 'x'.repeat(5000));
  const [row] = await rows();
  assert.equal(row.user_id, user);
  assert.equal(row.message.length, 1000);
  assert.equal(row.url, 'https://app.omikigolf.com/');
  assert.equal(row.view, 'scorecard');
  assert.equal(row.online, false);
});

test('invalid reports are ignored and each account is limited to 20 per hour', async () => {
  const { as, log, rows } = await database();
  await as(crypto.randomUUID());
  await log('other', 'boom');
  await log('render', '   ');
  assert.equal((await rows()).length, 0);
  for (let i = 0; i < 25; i++) await log('chunk', `fallo ${i}`);
  assert.equal((await rows()).length, 20);
  await as(null);
  await log('render', 'sin sesión');
  const last = (await rows()).at(-1);
  assert.equal(last.user_id, null);
  assert.equal(last.message, 'sin sesión');
});

test('the table is closed: only the logging function is granted to app roles', async () => {
  const { db } = await database();
  const table = (await db.query("SELECT has_table_privilege('anon','public.client_errors','SELECT') AS a, has_table_privilege('authenticated','public.client_errors','INSERT') AS b")).rows[0];
  assert.deepEqual(table, { a: false, b: false });
  const fn = (await db.query("SELECT has_function_privilege('anon','public.log_client_error(text,text,text,text,text,text,text,text,boolean)','EXECUTE') AS a")).rows[0];
  assert.equal(fn.a, true);
});

test('clients never see an error: the app reports it and reloads itself, waiting for coverage if needed', async () => {
  const boundary = await read('../src/components/ErrorBoundary.tsx');
  assert.match(boundary, /reportClientError\(error, errorInfo\.componentStack\)/);
  assert.match(boundary, /addEventListener\('online'/);
  assert.match(boundary, /OmikiLoadingScreen label=\{i18n\.t\('errorBoundary\.recovering'\)\}/);
  assert.doesNotMatch(boundary, /error\.toString\(\)|⚠️|details/);
  const i18n = await read('../src/i18n/index.ts');
  assert.doesNotMatch(i18n, /Algo salió mal|error inesperado/);
  const { isChunkLoadError } = await import('../src/utils/chunkError.ts');
  assert.equal(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /assets/Stats.js')), true);
  assert.equal(isChunkLoadError(new TypeError('Importing a module script failed.')), true);
  assert.equal(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'name')")), false);
});

test('a reopened round resumes at the first hole that still needs a score', async () => {
  const { resumeHoleIndex } = await import('../src/utils/resumeHole.ts');
  const holes = [1, 2, 3].map(hole_number => ({ hole_number }));
  const players = [{ id: 'a' }, { id: 'b' }];
  const score = (player_id, hole_number, gross_strokes = 4, abandoned = false) => ({ player_id, hole_number, gross_strokes, abandoned });
  assert.equal(resumeHoleIndex(holes, players, []), 1);
  assert.equal(resumeHoleIndex(holes, players, [score('a', 1), score('b', 1), score('a', 2)]), 2);
  assert.equal(resumeHoleIndex(holes, players, [score('a', 1), score('b', 1, 0, true), score('a', 2), score('b', 2)]), 3);
  assert.equal(resumeHoleIndex(holes, players, holes.flatMap(h => players.map(p => score(p.id, h.hole_number)))), 3);
  assert.equal(resumeHoleIndex([10, 11].map(hole_number => ({ hole_number })), players, [score('a', 10), score('b', 10)]), 2);
});
