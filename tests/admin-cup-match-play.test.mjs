import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateCupBracket } from '../src/utils/cupBracket.ts';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const migration = '../supabase/migrations/20261205100000_cup_match_play.sql';
const guestMigration = '../supabase/migrations/20261207100000_cup_guest_pairing.sql';
const alertMigration = '../supabase/migrations/20261208100000_cup_manager_alerts.sql';

async function database() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE test_session(uid uuid);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT uid FROM public.test_session LIMIT 1 $$;
    CREATE TABLE read_only_users(user_id uuid PRIMARY KEY);
    CREATE FUNCTION is_app_user_read_only() RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM public.read_only_users WHERE user_id=auth.uid()) $$;
    CREATE TABLE app_administrators(user_id uuid PRIMARY KEY, status text DEFAULT 'active');
    CREATE TABLE groups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_auth_id uuid, name text, group_code text, archived_at timestamptz,
      group_type text, max_players integer NOT NULL DEFAULT 20);
    CREATE TABLE group_members(group_id uuid, user_id uuid, role text DEFAULT 'member', UNIQUE(group_id,user_id));
    CREATE FUNCTION is_group_member(g uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM public.group_members WHERE group_id=g AND user_id=auth.uid()) $$;
    CREATE FUNCTION can_manage_group_messages(g uuid) RETURNS boolean LANGUAGE sql AS $$
      SELECT auth.uid() IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.app_administrators WHERE user_id=auth.uid())
        AND (EXISTS(SELECT 1 FROM public.groups WHERE id=g AND user_auth_id=auth.uid())
          OR EXISTS(SELECT 1 FROM public.group_members WHERE group_id=g AND user_id=auth.uid() AND role='admin')) $$;
    CREATE TABLE user_profiles(user_id uuid PRIMARY KEY, nick text, display_name text, avatar_url text);
    CREATE TABLE user_subscriptions(user_id uuid PRIMARY KEY, plan_type text, status text, current_period_end timestamptz);
    CREATE TABLE players(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), group_id uuid, auth_user_id uuid, name text,
      exact_handicap numeric NOT NULL DEFAULT 0, exact_handicap_18 numeric, playing_handicap numeric, is_guest boolean NOT NULL DEFAULT false,
      handicap_pending boolean NOT NULL DEFAULT false);
    CREATE TABLE seasons(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), group_id uuid, start_date date, end_date date);
    CREATE TABLE golf_courses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
    CREATE TABLE tees(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_id uuid, slope_18 numeric, slope_9_i numeric, slope_9_ii numeric);
    CREATE TABLE golf_rounds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_id uuid, created_by uuid, user_id text, group_id uuid,
      num_holes integer, holes_range text, use_slope boolean, manual_slope numeric, tee_id uuid, game_mode text DEFAULT 'stableford',
      status text DEFAULT 'active', access_code text, completed_at timestamptz, created_at timestamptz DEFAULT clock_timestamp(), updated_at timestamptz);
    CREATE TABLE round_players(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), round_id uuid REFERENCES golf_rounds(id) ON DELETE CASCADE, player_id uuid,
      user_id uuid, name text, exact_handicap numeric, exact_handicap_18 numeric, playing_handicap numeric, is_guest boolean NOT NULL DEFAULT false,
      created_at timestamptz DEFAULT clock_timestamp());
    CREATE TABLE round_scores(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), round_id uuid, player_id uuid, hole_number integer,
      gross_strokes integer, mode_points numeric, abandoned boolean DEFAULT false);
    CREATE TABLE archived_rounds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), group_id uuid, season_id uuid, final_ranking jsonb, source_round_id uuid);
    CREATE TABLE daily_rankings(group_id uuid, player_name text, total_points numeric);
    CREATE TABLE handicap_adjustments(group_id uuid, player_id uuid, adjustment numeric);
    CREATE TABLE test_notices(title text, body text, recipients uuid[]);
    CREATE TABLE quick_round_participation_invitations(round_player_id uuid, invited_user_id uuid, status text, round_id uuid);
    CREATE FUNCTION notify_group_membership_accounts(p_author uuid, p_group uuid, p_title text, p_body text, p_recipients uuid[]) RETURNS void
      LANGUAGE sql AS $$ INSERT INTO public.test_notices VALUES(p_title, p_body, p_recipients) $$;
    CREATE FUNCTION guard_group_round_stableford() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
    CREATE FUNCTION guard_guest_participation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
  `);
  await db.exec(await read(migration));
  await db.exec(await read(guestMigration));
  await db.exec(await read(alertMigration));
  await db.exec(`
    CREATE TRIGGER guard_group_round_stableford BEFORE INSERT OR UPDATE OF group_id, game_mode ON golf_rounds FOR EACH ROW EXECUTE FUNCTION guard_group_round_stableford();
    CREATE TRIGGER b_guest_participation BEFORE INSERT OR UPDATE OR DELETE ON round_players FOR EACH ROW EXECUTE FUNCTION guard_guest_participation();
  `);

  const as = async id => { await db.query('DELETE FROM test_session'); if (id) await db.query('INSERT INTO test_session VALUES($1)', [id]); };
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const user = async (nick, exact) => {
    const id = crypto.randomUUID();
    await db.query('INSERT INTO auth.users VALUES($1)', [id]);
    await db.query('INSERT INTO user_profiles(user_id, nick) VALUES($1,$2)', [id, nick]);
    return { id, nick, exact };
  };
  const owner = await user('Owner', 2);
  const members = [await user('Ana', 3), await user('Bea', 4), await user('Carlos', 5)];
  const outsider = await user('Fuera', 6);
  const group = (await one("INSERT INTO groups(user_auth_id, name) VALUES($1,'Los del viernes') RETURNING id", [owner.id])).id;
  await db.query("INSERT INTO user_subscriptions VALUES($1,'team','active',now()+interval '1 year')", [owner.id]);
  for (const account of [owner, ...members]) {
    await db.query("INSERT INTO group_members(group_id,user_id,role) VALUES($1,$2,$3)", [group, account.id, account === owner ? 'admin' : 'member']);
    await db.query('INSERT INTO players(group_id, auth_user_id, name, exact_handicap, exact_handicap_18, playing_handicap) VALUES($1,$2,$3,$4,$4,$4)',
      [group, account.id, account.nick, account.exact]);
  }
  await db.query("INSERT INTO players(group_id, name, exact_handicap) VALUES($1,'Legado',7)", [group]);
  await db.query("INSERT INTO players(group_id, name, exact_handicap, is_guest) VALUES($1,'Invitado del grupo',9,true)", [group]);
  const course = (await one("INSERT INTO golf_courses(name) VALUES('El Saler') RETURNING id")).id;
  // Ranking ordinario: Owner primero, Ana segunda.
  const pid = async account => (await one('SELECT id FROM players WHERE auth_user_id=$1', [account.id])).id;
  await db.query('INSERT INTO archived_rounds(group_id, final_ranking) VALUES($1,$2)', [group, JSON.stringify([
    { player_db_id: await pid(owner), points: 30, position: 1 }, { player_db_id: await pid(members[0]), points: 20, position: 2 },
  ])]);
  await db.query("INSERT INTO daily_rankings VALUES($1,'Owner',30)", [group]);

  const snapshot = async () => JSON.stringify({
    players: (await db.query('SELECT id, name, exact_handicap, exact_handicap_18, playing_handicap, is_guest FROM players ORDER BY id')).rows,
    archived: (await db.query('SELECT * FROM archived_rounds ORDER BY id')).rows,
    daily: (await db.query('SELECT * FROM daily_rankings ORDER BY player_name')).rows,
    handicaps: (await db.query('SELECT * FROM handicap_adjustments')).rows,
  });
  const purchase = async (key = crypto.randomUUID(), account = owner) => {
    await as(account.id);
    return (await one('SELECT public.purchase_cup_edition($1,$2) AS r', [group, key])).r;
  };
  const edition = async id => { await as(owner.id); return (await one('SELECT public.get_cup_edition($1) AS r', [id])).r; };
  const call = async (account, sql, params) => { await as(account.id); return db.query(sql, params); };
  return { db, as, one, owner, members, outsider, group, course, snapshot, purchase, edition, call };
}

// Juega una partida de 18 hoyos: el ganador gana el hoyo 1 y empatan el resto (1 UP), o empate total.
async function play(ctx, matchId, starter, result) {
  const { db, one, course, call } = ctx;
  const round = (await call(starter, 'SELECT public.start_cup_game($1,$2,NULL) AS r', [matchId, course])).rows[0].r;
  const players = (await db.query('SELECT id, cup_entrant_id FROM round_players WHERE round_id=$1', [round])).rows;
  assert.equal(players.length, 2);
  for (let hole = 1; hole <= 18; hole++) {
    for (const player of players) {
      const points = result !== 'tie' && hole === 1 ? (player.cup_entrant_id === result ? 1 : 0) : 0.5;
      await db.query('INSERT INTO round_scores(round_id, player_id, hole_number, gross_strokes, mode_points) VALUES($1,$2,$3,4,$4)',
        [round, player.id, hole, points]);
    }
  }
  await db.query("UPDATE golf_rounds SET status='completed' WHERE id=$1", [round]);
  assert.equal((await one('SELECT game_mode, num_holes, group_id IS NOT NULL AS grouped FROM golf_rounds WHERE id=$1', [round])).game_mode, 'match');
  return round;
}

const record = async (ctx, account, round, tiebreak = null, hole = null) =>
  (await ctx.call(account, 'SELECT public.record_cup_round($1,$2,$3) AS r', [round, tiebreak, hole])).rows[0].r;
const match = (cup, code) => cup.matches.find(item => item.code === code);
const entrant = (cup, name) => cup.entrants.find(item => item.name === name);

test('a paid purchase opens exactly one edition, idempotently and only for the Team owner', async () => {
  const ctx = await database();
  const { db, one, owner, members, group } = ctx;
  await assert.rejects(ctx.purchase(crypto.randomUUID(), members[0]), /propietario/);
  await db.query("UPDATE user_subscriptions SET plan_type='player'");
  await assert.rejects(ctx.purchase(), /Team o Premium/);
  await db.query("UPDATE user_subscriptions SET plan_type='team'");

  const key = crypto.randomUUID();
  const first = await ctx.purchase(key);
  const replay = await ctx.purchase(key);
  assert.equal(replay.edition_id, first.edition_id);
  assert.equal(replay.replayed, true);
  assert.equal((await one('SELECT count(*)::int AS n FROM cup_purchases')).n, 1);

  const cup = await ctx.edition(first.edition_id);
  assert.equal(cup.edition.status, 'draft');
  assert.match(cup.edition.name, /^Copa Match Play #1 · \d{4}$/);
  // Plantilla copiada sin el invitado del grupo; PJ de 18 hoyos.
  assert.deepEqual(cup.entrants.map(item => item.name).sort(), ['Ana', 'Bea', 'Carlos', 'Legado', 'Owner']);
  assert.equal(Number(entrant(cup, 'Carlos').playing_handicap), 10);

  // Un segundo intento mientras hay una edición abierta se rechaza, y el índice único lo garantiza.
  await assert.rejects(ctx.purchase(), /ya tiene una Copa abierta/);
  await assert.rejects(db.query("INSERT INTO cup_editions(group_id, number, name, created_by) VALUES($1, 9, 'Paralela', $2)", [group, owner.id]),
    /cup_editions_one_open/);
  assert.equal((await one('SELECT count(*)::int AS n FROM cup_editions')).n, 1);

  // Cancelarla habilita otra compra.
  await ctx.call(owner, 'SELECT public.set_cup_status($1,$2)', [first.edition_id, 'cancelled']);
  const second = await ctx.purchase();
  assert.equal((await ctx.edition(second.edition_id)).edition.number, 2);
});

test('a full edition from the draw to the champion leaves the ordinary group data untouched', async () => {
  const ctx = await database();
  const { db, one, owner, members, outsider, group, course } = ctx;
  const [ana, bea, carlos] = members;
  const before = await ctx.snapshot();
  const { edition_id: id } = await ctx.purchase();

  // Participantes: fuera el legado, entra un invitado sin cuenta y se edita su PJ solo para la Copa.
  let cup = await ctx.edition(id);
  await ctx.call(owner, 'SELECT public.remove_cup_entrant($1)', [entrant(cup, 'Legado').id]);
  await assert.rejects(ctx.call(ana, 'SELECT public.add_cup_entrant($1,NULL,NULL,$2,$3)', [id, 'Xavi', 14]), /creador o un administrador/);
  const xavi = (await ctx.call(owner, 'SELECT public.add_cup_entrant($1,NULL,NULL,$2,$3) AS r', [id, 'Xavi', 14])).rows[0].r;
  await ctx.call(owner, 'SELECT public.update_cup_entrant($1,$2,$3)', [xavi, 'Xavi', 20]);
  await ctx.call(owner, 'SELECT public.update_cup_settings($1,$2)', [id, JSON.stringify({ best_of: 3, final_best_of: 1, third_place: true, round_days: 14 })]);
  cup = await ctx.edition(id);
  assert.equal(cup.entrants.length, 5);
  assert.equal(entrant(cup, 'Xavi').has_account, false);

  // Sorteo por PJ (5 jugadores → cuadro de 8 con 3 pases directos), revisado y rehecho antes de publicar.
  const draw = () => generateCupBracket(cup.entrants.map(item => ({ id: item.id, playingHandicap: Number(item.playing_handicap) })),
    { capacity: 20, method: 'handicap', bestOf: 3 });
  const slots = draw().slice(0, 4).flatMap(tie => tie.players);
  await assert.rejects(ctx.call(owner, 'SELECT public.save_cup_draw($1,$2,$3)', [id, 'handicap', slots.slice(0, 4)]), /8 plazas/);
  await ctx.call(owner, 'SELECT public.save_cup_draw($1,$2,$3)', [id, 'handicap', slots]);
  await ctx.call(owner, 'SELECT public.discard_cup_draw($1)', [id]);
  assert.equal((await ctx.edition(id)).edition.status, 'draft');
  await ctx.call(owner, 'SELECT public.save_cup_draw($1,$2,$3)', [id, 'handicap', slots]);
  cup = await ctx.edition(id);
  assert.equal(entrant(cup, 'Owner').rank, 1);
  assert.equal(entrant(cup, 'Ana').rank, 2);
  assert.equal(entrant(cup, 'Xavi').rank, null);
  await ctx.call(owner, 'SELECT public.publish_cup_draw($1)', [id]);
  cup = await ctx.edition(id);
  assert.equal(cup.edition.status, 'active');

  // Pases directos: Owner, Ana y Bea ya están en semifinales; Carlos y Xavi juegan la ronda previa.
  const name = entrantId => cup.entrants.find(item => item.id === entrantId)?.name ?? null;
  assert.deepEqual([match(cup, '1-0').entrant_a, match(cup, '1-1').entrant_a, match(cup, '1-1').entrant_b].map(name), ['Owner', 'Ana', 'Bea']);
  const opening = match(cup, '0-1');
  assert.deepEqual([name(opening.entrant_a), name(opening.entrant_b)], ['Carlos', 'Xavi']);
  assert.ok(opening.deadline, 'el plazo de 14 días se fija al publicar');

  // Solo los jugadores del cruce o un gestor pueden jugarlo.
  await assert.rejects(ctx.call(outsider, 'SELECT public.start_cup_game($1,$2,NULL)', [opening.id, course]), /Solo los jugadores/);
  await assert.rejects(ctx.call(ana, 'SELECT public.start_cup_game($1,$2,NULL)', [opening.id, course]), /Solo los jugadores/);

  // Bo3: Carlos gana dos partidos y avanza; el invitado sin cuenta juega con la tarjeta de Carlos.
  const carlosId = entrant(cup, 'Carlos').id;
  const r1 = await play(ctx, opening.id, carlos, carlosId);
  await assert.rejects(ctx.call(carlos, "INSERT INTO archived_rounds(group_id, source_round_id) VALUES($1,$2)", [group, r1]), /no se archivan/);
  assert.equal((await record(ctx, carlos, r1)).score, '1 UP');
  assert.equal(name(match(await ctx.edition(id), '1-0').entrant_b), null, 'tras 1-0 la serie sigue abierta');
  const r2 = await play(ctx, opening.id, carlos, carlosId);
  await record(ctx, carlos, r2);
  assert.equal((await record(ctx, carlos, r2)).replayed, true, 'registrar dos veces es idempotente');
  cup = await ctx.edition(id);
  assert.equal(name(match(cup, '1-0').entrant_b), 'Carlos');
  assert.equal((await one("SELECT status FROM golf_rounds WHERE id=$1", [r2])).status, 'archived');

  // Corrección antes de que empiece el siguiente cruce: el partido 2 lo ganó Xavi (1-1) y se juega el tercero.
  await assert.rejects(ctx.call(carlos, 'SELECT public.correct_cup_game($1,2,$2,$3)', [opening.id, xavi, '2&1']), /creador o un administrador/);
  await ctx.call(owner, 'SELECT public.correct_cup_game($1,2,$2,$3)', [opening.id, xavi, '2&1']);
  cup = await ctx.edition(id);
  assert.equal(match(cup, '1-0').entrant_b, null);
  assert.equal(cup.games.find(game => game.match_id === opening.id && game.game_number === 2).source, 'corrected');
  const audit = await one("SELECT details FROM cup_audit WHERE action='cup.game.corrected'");
  assert.equal(audit.details.before.winner, carlosId);
  const r3 = await play(ctx, opening.id, carlos, xavi);
  await record(ctx, carlos, r3);
  cup = await ctx.edition(id);
  assert.equal(name(match(cup, '1-0').entrant_b), 'Xavi');

  // Pausada: el cuadro se ve pero no admite partidas ni resultados.
  await ctx.call(owner, 'SELECT public.set_cup_status($1,$2)', [id, 'paused']);
  await assert.rejects(ctx.call(ana, 'SELECT public.start_cup_game($1,$2,NULL)', [match(cup, '1-1').id, course]), /pausada/);
  await ctx.call(owner, 'SELECT public.set_cup_status($1,$2)', [id, 'active']);

  // Semifinal 1-1 en Bo3: empate tras 18 hoyos → muerte súbita en el 19; luego Ana gana el segundo.
  const semi = match(cup, '1-1');
  const anaId = entrant(cup, 'Ana').id;
  const tie = await play(ctx, semi.id, ana, 'tie');
  await assert.rejects(record(ctx, ana, tie), /muerte súbita/);
  const sudden = await record(ctx, ana, tie, anaId, 19);
  assert.equal(sudden.score, '1 UP (hoyo 19)');
  assert.equal((await one('SELECT decisive_hole FROM cup_games WHERE round_id=$1', [tie])).decisive_hole, 19);
  await record(ctx, ana, await play(ctx, semi.id, ana, anaId));

  // Semifinal 1-0 adjudicada sin disputarse; ya no se puede corregir el cruce previo.
  await ctx.call(owner, 'SELECT public.award_cup_match($1,$2,$3)', [match(cup, '1-0').id, entrant(cup, 'Owner').id, 'Xavi no puede jugar']);
  await assert.rejects(ctx.call(owner, 'SELECT public.correct_cup_game($1,3,$2,$3)', [opening.id, carlosId, '1 UP']), /siguiente cruce afectado ya ha empezado/);
  cup = await ctx.edition(id);
  const final = match(cup, '2-0');
  const bronze = match(cup, 'third-place');
  assert.deepEqual([name(final.entrant_a), name(final.entrant_b)], ['Owner', 'Ana']);
  assert.deepEqual([name(bronze.entrant_a), name(bronze.entrant_b)], ['Xavi', 'Bea']);

  // Iniciada la final, corregir una semifinal se rechaza (también comprueba el tercer puesto).
  const finalRound = await play(ctx, final.id, ana, anaId);
  await assert.rejects(ctx.call(owner, 'SELECT public.correct_cup_game($1,2,$2,$3)', [semi.id, entrant(cup, 'Bea').id, '1 UP']), /en juego o pendiente|siguiente cruce/);
  await record(ctx, ana, finalRound);
  assert.equal((await ctx.edition(id)).edition.status, 'active', 'falta el tercer puesto');
  // El tercer puesto sigue el formato de las rondas (Bo3).
  await record(ctx, bea, await play(ctx, bronze.id, bea, xavi));
  assert.equal((await ctx.edition(id)).edition.status, 'active');
  await record(ctx, bea, await play(ctx, bronze.id, bea, xavi));

  cup = await ctx.edition(id);
  assert.equal(cup.edition.status, 'finished');
  assert.equal(name(cup.edition.champion_entrant_id), 'Ana');
  assert.ok((await one("SELECT count(*)::int AS n FROM test_notices WHERE title LIKE '%campeón%'")).n === 1);
  const overview = (await ctx.call(owner, 'SELECT public.get_group_cup_overview($1) AS r', [group])).rows[0].r;
  assert.equal(overview.can_purchase, true);
  assert.equal(overview.editions[0].champion, 'Ana');

  // Jugar, adjudicar, corregir y cerrar no tocan hándicaps, archived_rounds ni rankings del grupo.
  assert.equal(await ctx.snapshot(), before);
  assert.equal((await one("SELECT count(*)::int AS n FROM golf_rounds WHERE cup_match_id IS NOT NULL AND status='archived'")).n, 8);

  // Borrar el grupo arrastra su Copa sin bloquearse en las partidas enlazadas.
  await db.query('DELETE FROM groups WHERE id=$1', [group]);
  assert.equal((await one('SELECT count(*)::int AS n FROM cup_editions')).n, 0);
  assert.equal((await one('SELECT count(*)::int AS n FROM golf_rounds WHERE cup_match_id IS NOT NULL')).n, 0);
});

test('cup links and players can only be set by the cup itself', async () => {
  const ctx = await database();
  const { db, owner, group, course } = ctx;
  await ctx.as(owner.id);
  const fakeMatch = crypto.randomUUID();
  await assert.rejects(db.query("INSERT INTO golf_rounds(course_id,user_id,group_id,num_holes,game_mode,cup_match_id) VALUES($1,$2,$3,18,'match',$4)",
    [course, owner.id, group, fakeMatch]), /se inician desde la Copa/);
  const round = (await db.query("INSERT INTO golf_rounds(course_id,user_id,group_id,num_holes,game_mode) VALUES($1,$2,$3,18,'stableford') RETURNING id",
    [course, owner.id, group])).rows[0].id;
  await assert.rejects(db.query('UPDATE golf_rounds SET cup_game_number=1 WHERE id=$1', [round]), /no se puede cambiar/);
});

test('optional registration: invited accounts confirm or decline before the draw', async () => {
  const ctx = await database();
  const { owner, members } = ctx;
  const [ana, bea] = members;
  const { edition_id: id } = await ctx.purchase();
  await ctx.call(owner, 'SELECT public.add_cup_entrant($1,NULL,NULL,$2,$3)', [id, 'Xavi', 14]);
  await ctx.call(owner, "SELECT public.open_cup_registration($1, now() + interval '7 days')", [id]);
  let cup = await ctx.edition(id);
  assert.equal(entrant(cup, 'Ana').registration, 'pending');
  assert.equal(entrant(cup, 'Owner').registration, 'confirmed');
  assert.equal(entrant(cup, 'Xavi').registration, 'confirmed');
  await assert.rejects(ctx.call(ctx.outsider, 'SELECT public.respond_cup_registration($1,true)', [id]), /No estás invitado/);
  await ctx.call(ana, 'SELECT public.respond_cup_registration($1,true)', [id]);
  await ctx.call(bea, 'SELECT public.respond_cup_registration($1,false)', [id]);
  cup = await ctx.edition(id);
  // Carlos sigue pendiente y Bea ha rechazado: solo entran Owner, Ana, Legado y Xavi.
  const pool = cup.entrants.filter(item => item.registration === 'confirmed');
  assert.equal(pool.length, 4);
  const slots = pool.map(item => item.id);
  await ctx.call(owner, 'SELECT public.save_cup_draw($1,$2,$3)', [id, 'manual', slots]);
  await ctx.call(owner, 'SELECT public.publish_cup_draw($1)', [id]);
  cup = await ctx.edition(id);
  assert.equal(cup.entrants.length, 4);
  assert.equal(cup.matches.length, 3);
  assert.equal(cup.edition.status, 'active');
});

test('guests without an account: never more than registered, never paired in the first round, played on paper', async () => {
  const ctx = await database();
  const { db, one, owner, members, outsider, course } = ctx;
  const [ana] = members;
  const before = await ctx.snapshot();
  const { edition_id: id } = await ctx.purchase();
  // Plantilla: Owner, Ana, Bea y Carlos con cuenta; Legado sin cuenta. Tres invitados más: 4 y 4.
  for (const guest of ['G1', 'G2', 'G3']) await ctx.call(owner, 'SELECT public.add_cup_entrant($1,NULL,NULL,$2,10)', [id, guest]);
  const extra = (await ctx.call(owner, "SELECT public.add_cup_entrant($1,NULL,NULL,'G4',10) AS r", [id])).rows[0].r;
  let cup = await ctx.edition(id);
  const ids = Object.fromEntries(cup.entrants.map(item => [item.name, item.id]));
  const slotsWith = names => names.map(item => item && ids[item]);

  // 5 invitados frente a 4 registrados: no hay cuadro posible.
  await assert.rejects(ctx.call(owner, 'SELECT public.save_cup_draw($1,$2,$3)',
    [id, 'manual', slotsWith(['Owner', 'Legado', 'Ana', null, 'G1', null, 'Bea', null, 'G2', null, 'Carlos', null, 'G3', null, 'G4', null])]),
  /más invitados sin cuenta \(5\) que jugadores registrados \(4\)/);
  await ctx.call(owner, 'SELECT public.remove_cup_entrant($1)', [extra]);

  // Un cruce entre dos invitados se rechaza aunque el sorteo sea manual.
  await assert.rejects(ctx.call(owner, 'SELECT public.save_cup_draw($1,$2,$3)',
    [id, 'manual', slotsWith(['Owner', 'Ana', 'Legado', 'G1', 'Bea', 'G2', 'Carlos', 'G3'])]), /cruce 2 enfrenta a dos invitados/);

  // Un sorteo preparado antes de esta regla tampoco se puede publicar.
  await db.exec('ALTER TABLE cup_editions DISABLE TRIGGER a_cup_draw_guests');
  await db.query("UPDATE cup_editions SET draw_method='manual', status='draw_ready', draw_slots=$2 WHERE id=$1",
    [id, slotsWith(['Owner', 'Ana', 'Legado', 'G1', 'Bea', 'G2', 'Carlos', 'G3'])]);
  await db.exec('ALTER TABLE cup_editions ENABLE TRIGGER a_cup_draw_guests');
  await assert.rejects(ctx.call(owner, 'SELECT public.publish_cup_draw($1)', [id]), /dos invitados/);
  await ctx.call(owner, 'SELECT public.discard_cup_draw($1)', [id]);

  // Reparto válido: cada invitado frente a un registrado.
  await ctx.call(owner, 'SELECT public.save_cup_draw($1,$2,$3)', [id, 'manual', slotsWith(['Owner', 'Legado', 'Ana', 'G1', 'Bea', 'G2', 'Carlos', 'G3'])]);
  await ctx.call(owner, 'SELECT public.publish_cup_draw($1)', [id]);
  cup = await ctx.edition(id);

  // Los invitados ganan en papel y se cruzan en la siguiente ronda: solo un gestor anota el resultado.
  const paper = (account, matchId, winner, score, hole = null) =>
    ctx.call(account, 'SELECT public.record_cup_paper_game($1,$2,$3,$4)', [matchId, winner, score, hole]);
  await assert.rejects(paper(ana, match(cup, '0-0').id, ids.Legado, '2&1'), /creador o un administrador/);
  await assert.rejects(paper(outsider, match(cup, '0-0').id, ids.Legado, '2&1'), /creador o un administrador/);
  await assert.rejects(paper(owner, match(cup, '0-0').id, ids.G1, '2&1'), /uno de los dos jugadores/);
  await paper(owner, match(cup, '0-0').id, ids.Legado, '2&1');
  await paper(owner, match(cup, '0-1').id, ids.G1, '1 UP', 19);
  cup = await ctx.edition(id);
  const semi = match(cup, '1-0');
  assert.deepEqual([semi.entrant_a, semi.entrant_b], [ids.Legado, ids.G1]);
  const game = cup.games.find(item => item.match_id === match(cup, '0-1').id);
  assert.equal(game.source, 'paper');
  assert.equal(game.decisive_hole, 19);
  assert.equal(game.round_id ?? null, null);
  await assert.rejects(paper(owner, match(cup, '0-0').id, ids.Legado, '2&1'), /no está pendiente/);

  // Con una tarjeta abierta en la app no se anota en papel.
  await ctx.call(owner, 'SELECT public.start_cup_game($1,$2,NULL)', [semi.id, course]);
  await assert.rejects(paper(owner, semi.id, ids.G1, '3&2'), /en juego o pendiente/);
  await db.query("UPDATE golf_rounds SET status='cancelled' WHERE cup_match_id=$1", [semi.id]);
  await paper(owner, semi.id, ids.G1, '3&2');
  assert.equal(match(await ctx.edition(id), '2-0').entrant_a, ids.G1);
  assert.equal((await one("SELECT count(*)::int AS n FROM cup_audit WHERE action='cup.game.paper'")).n, 3);
  assert.equal(await ctx.snapshot(), before, 'la Copa no toca hándicaps, rankings ni partidas archivadas');
});

test('the Home red dot also warns the creator and admins when the cup needs managing', async () => {
  const ctx = await database();
  const { db, owner, members } = ctx;
  const [ana] = members;
  const { edition_id: id } = await ctx.purchase();
  await ctx.call(owner, "SELECT public.add_cup_entrant($1,NULL,NULL,'G1',10)", [id]);
  let cup = await ctx.edition(id);
  const ids = Object.fromEntries(cup.entrants.map(item => [item.name, item.id]));
  const shortcut = async account => (await ctx.call(account, 'SELECT public.list_my_cup_shortcuts() AS r')).rows[0].r
    .find(item => item.edition_id === id);

  assert.equal((await shortcut(owner)).manage, false, 'borrador sin nada que gestionar');
  await ctx.call(owner, 'SELECT public.save_cup_draw($1,$2,$3)',
    [id, 'manual', ['Owner', 'Legado', 'Ana', 'G1', 'Bea', null, 'Carlos', null].map(item => item && ids[item])]);
  assert.equal((await shortcut(owner)).manage, true, 'cuadro preparado sin publicar');
  assert.equal((await shortcut(ana)).manage, false, 'un participante no gestiona');

  await ctx.call(owner, 'SELECT public.publish_cup_draw($1)', [id]);
  await db.query('UPDATE cup_matches SET deadline = NULL WHERE edition_id = $1', [id]);
  assert.equal((await shortcut(owner)).manage, false);
  cup = await ctx.edition(id);
  await db.query("UPDATE cup_matches SET deadline = now() - interval '1 day' WHERE id = $1", [match(cup, '0-0').id]);
  assert.equal((await shortcut(owner)).manage, true, 'plazo vencido');
  await db.query('UPDATE cup_matches SET deadline = NULL WHERE edition_id = $1', [id]);

  // Los dos invitados ganan y se cruzan: hay que anotar su partido en papel.
  const paper = (matchId, winner) => ctx.call(owner, "SELECT public.record_cup_paper_game($1,$2,'2&1',NULL)", [matchId, winner]);
  await paper(match(cup, '0-0').id, ids.Legado);
  await paper(match(cup, '0-1').id, ids.G1);
  assert.equal((await shortcut(owner)).manage, true, 'cruce entre invitados pendiente');
  await paper(match(await ctx.edition(id), '1-0').id, ids.G1);
  assert.equal((await shortcut(owner)).manage, false, 'anotado: no queda nada que gestionar');
});
