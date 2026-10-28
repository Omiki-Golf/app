import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const fixture = await read('./helpers/verified-round-owners-fixture.sql');
const verified = await read('../supabase/migrations/20261028100000_verified_round_owners.sql');
const administration = await read('../supabase/migrations/20260912190000_app_round_management.sql');
const migration = await read('../supabase/migrations/20261028130000_round_code_editors.sql');
const app = await read('../src/App.tsx');
const service = await read('../src/services/golfService.ts');
const scorecard = await read('../src/components/Scorecard.tsx');
const setupSQL = fixture + administration.slice(administration.indexOf('CREATE FUNCTION public.admin_change_app_round('), administration.indexOf('CREATE FUNCTION public.count_available_quick_rounds(')) + verified;
const A = '00000000-0000-4000-8000-000000000001', B = '00000000-0000-4000-8000-000000000002';

async function as(db, uid = '', headers = {}) {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.uid',$1,false),set_config('request.headers',$2,false)", [uid, JSON.stringify(headers)]);
  await db.exec(uid ? 'SET ROLE authenticated' : 'SET ROLE anon');
}
const score = (r, p, strokes = 5) => [{ round_id: r, player_id: p, hole_number: 1, gross_strokes: strokes, strokes_received: 0, net_strokes: strokes, stableford_points: 2, mode_points: 0 }];
const writeByCode = (db, r, p, code, strokes) => db.query('SELECT write_round_hole_scores_by_code($1,1,$2::jsonb,$3) AS res', [r, JSON.stringify(score(r, p, strokes)), code]).then(x => x.rows[0].res);
const value = rows => Object.values(rows.rows[0])[0];

test('codes become private and let their holder enter scores, never administer the round', async () => {
  const db = new PGlite();
  try {
    await db.exec(setupSQL);
    // An existing round: its public code moves to the private table.
    await db.exec("ALTER TABLE golf_rounds DISABLE TRIGGER USER");
    const old = value(await db.query("INSERT INTO golf_rounds(user_id,access_code) VALUES($1,'1234') RETURNING id", [A]));
    await db.exec("ALTER TABLE golf_rounds ENABLE TRIGGER USER");
    await db.exec(migration);
    assert.equal(value(await db.query('SELECT access_code FROM golf_rounds WHERE id=$1', [old])), null);
    assert.equal(value(await db.query('SELECT code FROM round_access_codes WHERE round_id=$1', [old])), '1234');

    // New rounds never keep the code in the public row, and an active duplicate gets another code.
    await as(db, A);
    const r = value(await db.query("INSERT INTO golf_rounds(user_id,access_code) VALUES($1,'1234') RETURNING id", [A]));
    const p = value(await db.query('INSERT INTO round_players(round_id) VALUES($1) RETURNING id', [r]));
    assert.equal(value(await db.query('SELECT access_code FROM golf_rounds WHERE id=$1', [r])), null);
    const code = value(await db.query('SELECT get_round_access_code($1)', [r]));
    assert.match(code, /^\d{4}$/);
    assert.notEqual(code, '1234');

    // Someone else cannot read the code, but can find the round and enter scores with it.
    await as(db, B, { 'x-forwarded-for': '10.0.0.1' });
    assert.equal(value(await db.query('SELECT get_round_access_code($1)', [r])), null);
    assert.equal((await db.query('SELECT id FROM find_active_round_by_code($1)', [code])).rows[0].id, r);
    assert.equal(value(await db.query('SELECT verify_round_access_code($1,$2)', [r, code])), true);
    const saved = await writeByCode(db, r, p, code, 6);
    assert.equal(saved.ok, true);
    assert.equal(saved.scores[0].gross_strokes, 6);
    assert.equal((await db.query('SELECT delete_round_score_by_code($1,$2,1,$3) AS res', [r, p, code])).rows[0].res.ok, true);
    await writeByCode(db, r, p, code, 5);

    // Administrative actions stay with the creator.
    await assert.rejects(db.query('SELECT write_verified_hole_scores($1,1,$2::jsonb)', [r, JSON.stringify(score(r, p))]), /creador/);
    await assert.rejects(db.query('SELECT finish_round($1,NULL)', [r]), /creador/);
    await assert.rejects(db.query("UPDATE golf_rounds SET status='archived' WHERE id=$1", [r]), /creador/);
    await assert.rejects(db.query("UPDATE golf_rounds SET course_id=gen_random_uuid() WHERE id=$1", [r]), /creador/);
    await assert.rejects(db.query('DELETE FROM round_players WHERE id=$1', [p]), /permiso/);

    // The code allowance does not leak into later statements.
    await assert.rejects(db.query("UPDATE round_scores SET gross_strokes=2 WHERE round_id=$1", [r]), /creador/);

    // A wrong code is refused without raising and counts towards the limit.
    assert.equal((await writeByCode(db, r, p, '0000', 4)).ok, false);
    for (let i = 0; i < 29; i += 1) await db.query('SELECT verify_round_access_code($1,$2)', [r, '0000']);
    await assert.rejects(db.query('SELECT verify_round_access_code($1,$2)', [r, code]), /Demasiados intentos/);
    await as(db, B, { 'x-forwarded-for': '10.0.0.2' });
    assert.equal(value(await db.query('SELECT verify_round_access_code($1,$2)', [r, code])), true);

    // Once the creator finishes, the code no longer allows edits.
    await as(db, A);
    await db.query('SELECT finish_round($1,NULL)', [r]);
    await as(db, B, { 'x-forwarded-for': '10.0.0.2' });
    await assert.rejects(writeByCode(db, r, p, code, 3), /finalizado/);
    assert.equal((await db.query('SELECT id FROM find_active_round_by_code($1)', [code])).rows.length, 0);
  } finally { await db.close(); }
});

test('the app uses the private code endpoints and keeps admin controls creator-only', () => {
  assert.doesNotMatch(service, /\.eq\('access_code'/);
  assert.match(service, /find_active_round_by_code/);
  assert.match(service, /write_round_hole_scores_by_code/);
  assert.match(app, /canEditRoundScores\(isCreator, roundData\.round\.status, !!storedCode\)/);
  assert.match(app, /canFinishRound=\{roundState\.isCreator\}/);
  assert.match(app, /hasEditAccess=\{roundState\.isCreator && roundState\.hasEditAccess && !readOnly\}/);
  assert.match(scorecard, /hasEditAccess && isCreator && onCourseChanged/);
});
