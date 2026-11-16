import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('same-day group rounds only add up when they share a ranking session', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const migration = await read('../supabase/migrations/20261116100000_daily_ranking_sessions.sql');
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE players(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid);
    CREATE TABLE archived_rounds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid,course_name text,played_at timestamptz,
      archived_at timestamptz DEFAULT now(),season_id uuid,handicap_adjusted boolean DEFAULT false,source_round_id uuid,
      final_ranking jsonb,player_stats jsonb,hole_scores jsonb);
    CREATE TABLE daily_rankings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid,ranking_date date,player_name text,
      game_player_id uuid,total_points numeric,hcp_juego integer,position integer,receives_beer boolean,pays_beer boolean,
      total_strokes integer,total_stableford_net numeric,handicap_play numeric,gamification_counts jsonb NOT NULL DEFAULT '{}');
    CREATE FUNCTION statistics_player_id(p_group uuid,p_result jsonb) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
      SELECT coalesce(nullif(p_result->>'player_db_id','')::uuid,md5('legacy:' || coalesce(p_group::text,'') || ':' || coalesce(p_result->>'player_name',''))::uuid)
    $$;
  `);
  await db.exec(migration);

  const group = '00000000-0000-0000-0000-0000000000aa';
  const archive = (session, ana, bea) => db.query(
    `INSERT INTO archived_rounds(group_id,course_name,played_at,final_ranking,player_stats,hole_scores,ranking_session)
     VALUES($1,'Campo','2026-11-16T10:00:00Z',$2,'[]','[]',$3) RETURNING id`,
    [group, JSON.stringify([{ player_name: 'Ana', points: ana, hcp_juego: 10 }, { player_name: 'Bea', points: bea, hcp_juego: 12 }]), session],
  );
  const recalc = () => db.query(`SELECT calculate_daily_ranking($1,'2026-11-16')`, [group]);
  const rows = async () => (await db.query(
    `SELECT ranking_session,player_name,total_points::int AS points,position FROM daily_rankings ORDER BY ranking_session,position`,
  )).rows;

  // Primera vuelta y 2ª vuelta (misma jornada): se suman.
  await archive(1, 10, 5);
  await archive(1, 8, 12);
  await recalc();
  assert.deepEqual(await rows(), [
    { ranking_session: 1, player_name: 'Ana', points: 18, position: 1 },
    { ranking_session: 1, player_name: 'Bea', points: 17, position: 2 },
  ]);

  // Partida diferente el mismo día: clasificación aparte, sin tocar la primera.
  const separate = await archive(2, 3, 9);
  await recalc();
  assert.deepEqual(await rows(), [
    { ranking_session: 1, player_name: 'Ana', points: 18, position: 1 },
    { ranking_session: 1, player_name: 'Bea', points: 17, position: 2 },
    { ranking_session: 2, player_name: 'Bea', points: 9, position: 1 },
    { ranking_session: 2, player_name: 'Ana', points: 3, position: 2 },
  ]);

  // Si se borra la partida aparte, su clasificación desaparece.
  await db.query('DELETE FROM archived_rounds WHERE id=$1', [separate.rows[0].id]);
  await recalc();
  assert.equal((await rows()).length, 2);
  await db.close();
});

test('archiving a second 9-hole group round of the day asks whether it is the 2nd nine', async () => {
  const [viewer, service, modal, history] = await Promise.all([
    read('../src/components/ActiveRoundsViewer.tsx'),
    read('../src/services/golfService.ts'),
    read('../src/components/ArchivedRoundDetailModal.tsx'),
    read('../src/components/ArchivedRoundsModal.tsx'),
  ]);
  assert.match(viewer, /¿Esta partida es la 2ª vuelta o una partida diferente\?/);
  assert.match(viewer, /target\.round\.num_holes === 9/);
  assert.match(viewer, /handleArchiveRoundClick\(id, 'new'\)/);
  assert.match(service, /sessionChoice === 'new' \? latestSession \+ 1 : latestSession/);
  assert.match(service, /ranking_session: rankingSession/);
  assert.match(modal, /round\.ranking_session\)/);
  assert.match(modal, /round\.ranking_session\]\);/);
  assert.match(history, /groupedBySession/);
  assert.match(history, /Jornada \{session\}/);
  assert.match(history, /onSelectRound\(dayRounds\[0\]\)/);
});
