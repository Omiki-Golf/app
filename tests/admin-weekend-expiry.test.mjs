import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const load = async path => {
  const js = ts.transpileModule(await read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  Function('module', 'exports', js)(module, module.exports);
  return module.exports;
};

test('Weekend expiry is counted in Madrid calendar days and shown as 23:59', async () => {
  const { weekendDaysLeft, weekendExpiryText, weekendLastWeek } = await load('../src/utils/weekendMode.ts');
  // 18/11 23:59:59 en Madrid (UTC+1).
  const until = '2026-11-18T22:59:59Z';
  assert.equal(weekendDaysLeft(until, Date.parse('2026-11-18T10:00:00Z')), 0);
  assert.equal(weekendExpiryText(until, Date.parse('2026-11-18T10:00:00Z')), 'hoy a las 23:59 h');
  assert.equal(weekendExpiryText(until, Date.parse('2026-11-17T22:30:00Z')), 'mañana a las 23:59 h');
  assert.equal(weekendExpiryText(until, Date.parse('2026-11-11T12:00:00Z')), 'el 18 de noviembre a las 23:59 h');
  assert.equal(weekendDaysLeft(until, Date.parse('2026-11-18T23:00:00Z')), null);
  // Solo el Weekend de 3 meses avisa en su última semana.
  assert.equal(weekendLastWeek(until, 90, Date.parse('2026-11-12T10:00:00Z')), true);
  assert.equal(weekendLastWeek(until, 90, Date.parse('2026-11-05T10:00:00Z')), false);
  assert.equal(weekendLastWeek(until, 7, Date.parse('2026-11-12T10:00:00Z')), false);
});

test('Weekend ends at end of day, allows one group per purchase and archives itself', async () => {
  const sql = await read('../supabase/migrations/20261118100000_weekend_end_of_day_and_auto_archive.sql');
  assert.match(sql, /v_until := public\.weekend_end_of_day\(/);
  assert.match(sql, /Ya tienes un grupo Weekend activo: %/);
  assert.match(sql, /Este Weekend ya tiene su grupo/);
  assert.match(sql, /UPDATE public\.groups SET archived_at=weekend_mode_until/);
  assert.match(sql, /cron\.schedule\('archive-expired-weekend-groups'/);
  assert.match(sql, /group_type='weekend' AND weekend_mode_until<=clock_timestamp\(\)/);
});

test('Home offers Team from the last-week notice and loaders archive expired Weekends', async () => {
  const [app, home, groups, creation, plans] = await Promise.all([
    read('../src/App.tsx'),
    read('../src/components/HomeScreen.tsx'),
    read('../src/components/MyGroups.tsx'),
    read('../src/components/TeamCreation.tsx'),
    read('../src/components/PlansComparison.tsx'),
  ]);
  assert.match(app, /setPlansContext\('team'\)/);
  assert.match(app, /initialPlan=\{plansContext === 'team' \? 'team' : undefined\}/);
  assert.match(plans, /useState<DisplayPlan>\(initialPlan \?\?/);
  assert.match(home, /weekendLastWeek\(group\.weekend_mode_until, group\.weekend_days\)/);
  assert.match(home, /Contratar Team/);
  assert.match(app, /rpc\('archive_expired_weekend_groups'\)/);
  assert.match(groups, /rpc\('archive_expired_weekend_groups'\)/);
  assert.match(creation, /Ya tienes tu grupo Weekend/);
});

test('Team holds up to 3 plan groups and a 3-month Weekend group can take a free slot', async () => {
  const { nextGroupKind, weekendConversion } = await load('../src/utils/groupCapacity.ts');
  const now = Date.parse('2026-11-14T10:00:00Z');
  const team = { group_type: 'team' };
  const w7 = { group_type: 'weekend', weekend_days: 7, weekend_mode_until: '2026-11-18T22:59:59Z' };
  const w90 = { group_type: 'weekend', weekend_days: 90, weekend_mode_until: '2027-02-14T22:59:59Z' };
  // Un Weekend de 7 días y otro de 3 meses a la vez, cada uno con su grupo.
  assert.equal(nextGroupKind({ ownedGroups: [team, w7], extraGroups: 0, weekend7Until: w7.weekend_mode_until, weekend90Until: w90.weekend_mode_until, hasTeamPlan: true, now }), 'weekend90');
  assert.equal(nextGroupKind({ ownedGroups: [team, w7, w90], extraGroups: 0, weekend7Until: w7.weekend_mode_until, weekend90Until: w90.weekend_mode_until, hasTeamPlan: true, now }), null);
  // Incluido + 2 adicionales = 3 grupos del plan como máximo.
  assert.equal(nextGroupKind({ ownedGroups: [team, team], extraGroups: 2, hasTeamPlan: true, now }), 'team');
  assert.equal(nextGroupKind({ ownedGroups: [team, team, team], extraGroups: 5, hasTeamPlan: true, now }), null);
  // Pasar el Weekend de 3 meses a Team.
  assert.equal(weekendConversion({ ownedGroups: [w90], extraGroups: 0, hasPaidTeamPlan: true }), 'free');
  assert.equal(weekendConversion({ ownedGroups: [team, w90], extraGroups: 1, hasPaidTeamPlan: true }), 'free');
  assert.equal(weekendConversion({ ownedGroups: [team, w90], extraGroups: 0, hasPaidTeamPlan: true }), 'additional');
  assert.equal(weekendConversion({ ownedGroups: [team, team, w90], extraGroups: 1, hasPaidTeamPlan: true }), 'additional');
  assert.equal(weekendConversion({ ownedGroups: [team, team, team, w90], extraGroups: 2, hasPaidTeamPlan: true }), 'full');
  assert.equal(weekendConversion({ ownedGroups: [w90], extraGroups: 0, hasPaidTeamPlan: false }), 'not-team');
});

test('database keeps one Weekend per duration, caps plan groups at 3 and converts 3-month groups', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const [tiers, expiry, rules] = await Promise.all([
    read('../supabase/migrations/20261117100000_group_tiers_and_purchase_scope.sql'),
    read('../supabase/migrations/20261118100000_weekend_end_of_day_and_auto_archive.sql'),
    read('../supabase/migrations/20261119100000_two_weekends_and_team_conversion.sql'),
  ]);
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE test_session(uid uuid);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT uid FROM public.test_session LIMIT 1 $$;
    CREATE FUNCTION public.is_app_user_read_only() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE TABLE user_subscriptions(user_id uuid PRIMARY KEY,plan_type text,status text,current_period_end timestamptz,team_trial_ends_at timestamptz,weekend_mode_until timestamptz,updated_at timestamptz DEFAULT now());
    CREATE TABLE groups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,group_code text,user_auth_id uuid,archived_at timestamptz,group_type text NOT NULL DEFAULT 'team',weekend_mode_until timestamptz,premium_branding boolean NOT NULL DEFAULT false,created_at timestamptz DEFAULT now(),hoyo_19_enabled boolean DEFAULT true,max_players integer DEFAULT 20,simultaneous_season_enabled boolean DEFAULT false);
    CREATE TABLE pro_shop_purchases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid,purchased_by uuid,product_type text,amount_paid numeric,payment_method text,status text);
    CREATE TABLE group_gamification(group_id uuid,product_id text,purchased boolean,enabled boolean,updated_by uuid,updated_at timestamptz DEFAULT now(),PRIMARY KEY(group_id,product_id));
    CREATE TABLE group_invitations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid,status text);
    CREATE FUNCTION public.activate_group_gamification(uuid,text[]) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  `);
  await db.exec(tiers);
  // PGlite no tiene pg_cron: se omite solo la programación de la tarea.
  await db.exec(expiry.replace(/CREATE EXTENSION IF NOT EXISTS pg_cron[^;]*;/, '').replace(/SELECT cron\.schedule\([^;]*;/, ''));
  await db.exec(rules);

  const owner = async (id, plan = 'team') => {
    await db.query('DELETE FROM test_session');
    await db.query('INSERT INTO test_session VALUES($1)', [id]);
    await db.query(`INSERT INTO user_subscriptions(user_id,plan_type,status,current_period_end) VALUES($1,$2,'active',now()+interval '1 year') ON CONFLICT DO NOTHING`, [id, plan]);
  };
  const group = (id, type = 'team', days = null) => db.query(
    'INSERT INTO groups(name,group_code,user_auth_id,group_type,weekend_days) VALUES($1,$1,$2,$3,$4) RETURNING id', [`G-${type}-${days ?? ''}`, id, type, days]);
  const convert = async groupId => (await db.query('SELECT public.convert_weekend_group_to_team($1) AS r', [groupId])).rows[0].r;
  const additional = async () => (await db.query(`SELECT count(*)::int AS n FROM pro_shop_purchases WHERE product_type='grupo-adicional'`)).rows[0].n;

  // Weekend de 7 días y de 3 meses a la vez; nunca dos de la misma duración.
  const a = '00000000-0000-0000-0000-0000000000a1';
  await owner(a);
  await db.query('SELECT public.activate_weekend_for_testing(7)');
  await db.query('SELECT public.activate_weekend_for_testing(90)');
  await assert.rejects(db.query('SELECT public.activate_weekend_for_testing(7)'), /Weekend de 7 días activo/);
  await group(a, 'weekend', 7);
  const a90 = await group(a, 'weekend', 90);
  await assert.rejects(group(a, 'weekend', 90), /ya tiene su grupo|de esa duración/);
  await assert.rejects(db.query('SELECT public.activate_weekend_for_testing(90)'), /grupo Weekend de 3 meses activo/);
  // Sin grupo incluido creado: pasa a Team gratis.
  assert.equal(await convert(a90.rows[0].id), 'free');
  assert.equal(await additional(), 0);
  assert.equal((await db.query('SELECT group_type FROM groups WHERE id=$1', [a90.rows[0].id])).rows[0].group_type, 'team');

  // Con el grupo incluido creado: pasa a Team ocupando un Grupo Adicional.
  const b = '00000000-0000-0000-0000-0000000000b1';
  await owner(b);
  await group(b);
  await db.query('SELECT public.activate_weekend_for_testing(90)');
  const b90 = await group(b, 'weekend', 90);
  assert.equal(await convert(b90.rows[0].id), 'additional');
  assert.equal(await additional(), 1);

  // Incluido + 2 adicionales: no hay cuarto grupo ni conversión posible.
  const c = '00000000-0000-0000-0000-0000000000c1';
  await owner(c);
  await group(c);
  await db.query('SELECT public.add_additional_group_for_testing()');
  await db.query('SELECT public.add_additional_group_for_testing()');
  await assert.rejects(db.query('SELECT public.add_additional_group_for_testing()'), /Ya tienes tus 2 Grupos Adicionales/);
  await group(c); await group(c);
  await assert.rejects(group(c), /más grupos activos/);
  await db.query('SELECT public.activate_weekend_for_testing(90)');
  const c90 = await group(c, 'weekend', 90);
  await assert.rejects(convert(c90.rows[0].id), /3 grupos Team/);

  // Un Player no puede pasar el grupo a Team; el de 7 días tampoco.
  const d = '00000000-0000-0000-0000-0000000000d1';
  await owner(d, 'player');
  await db.query('SELECT public.activate_weekend_for_testing(7)');
  const d7 = await group(d, 'weekend', 7);
  await assert.rejects(convert(d7.rows[0].id), /3 meses/);
  await db.query('SELECT public.activate_weekend_for_testing(90)');
  const d90 = await group(d, 'weekend', 90);
  await assert.rejects(convert(d90.rows[0].id), /plan Team/);
  await db.close();
});

test('Pro-Shop sells titles and add-ons per group, Weekend included, and never removes what was paid', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const [tiers, expiry, rules] = await Promise.all([
    read('../supabase/migrations/20261117100000_group_tiers_and_purchase_scope.sql'),
    read('../supabase/migrations/20261118100000_weekend_end_of_day_and_auto_archive.sql'),
    read('../supabase/migrations/20261119100000_two_weekends_and_team_conversion.sql'),
  ]);
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE test_session(uid uuid);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT uid FROM public.test_session LIMIT 1 $$;
    CREATE FUNCTION public.is_app_user_read_only() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE TABLE user_subscriptions(user_id uuid PRIMARY KEY,plan_type text,status text,current_period_end timestamptz,team_trial_ends_at timestamptz,weekend_mode_until timestamptz,updated_at timestamptz DEFAULT now());
    CREATE TABLE groups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,group_code text,user_auth_id uuid,archived_at timestamptz,group_type text NOT NULL DEFAULT 'team',weekend_mode_until timestamptz,premium_branding boolean NOT NULL DEFAULT false,created_at timestamptz DEFAULT now(),hoyo_19_enabled boolean DEFAULT true,max_players integer DEFAULT 20,simultaneous_season_enabled boolean DEFAULT false);
    CREATE TABLE pro_shop_purchases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid,purchased_by uuid,product_type text,amount_paid numeric,payment_method text,status text);
    CREATE TABLE group_gamification(group_id uuid,product_id text,purchased boolean,enabled boolean,updated_by uuid,updated_at timestamptz DEFAULT now(),PRIMARY KEY(group_id,product_id));
    CREATE TABLE group_invitations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid,status text);
    CREATE FUNCTION public.activate_group_gamification(uuid,text[]) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  `);
  await db.exec(tiers);
  await db.exec(expiry.replace(/CREATE EXTENSION IF NOT EXISTS pg_cron[^;]*;/, '').replace(/SELECT cron\.schedule\([^;]*;/, ''));
  await db.exec(rules);
  // El trigger de la tabla real llama a seed_group_gamification_defaults al crear un grupo.
  await db.exec('CREATE TRIGGER seed_group_gamification_defaults AFTER INSERT ON public.groups FOR EACH ROW EXECUTE FUNCTION public.seed_group_gamification_defaults()');

  const owner = '00000000-0000-0000-0000-0000000000e1';
  await db.query('INSERT INTO test_session VALUES($1)', [owner]);
  await db.query(`INSERT INTO user_subscriptions(user_id,plan_type,status,current_period_end) VALUES($1,'team','active',now()+interval '1 year')`, [owner]);
  const group = async (type = 'team', days = null) => (await db.query(
    'INSERT INTO groups(name,group_code,user_auth_id,group_type,weekend_days) VALUES($1,$1,$2,$3,$4) RETURNING id', [`G-${type}`, owner, type, days])).rows[0].id;
  const titlesOf = async id => (await db.query(`SELECT product_id FROM group_gamification WHERE group_id=$1 AND purchased ORDER BY 1`, [id])).rows.map(row => row.product_id);

  const team = await group();
  await db.query(`SELECT public.activate_group_gamification($1, ARRAY['spanish-hand','buceador'])`, [team]);
  // Enviar una lista menor no retira nada de lo pagado.
  await db.query(`SELECT public.activate_group_gamification($1, ARRAY['spanish-hand'])`, [team]);
  assert.deepEqual(await titlesOf(team), ['buceador', 'no-paso-rojas', 'spanish-hand']);

  // Un Team nuevo no hereda títulos de los otros grupos.
  await db.query('SELECT public.add_additional_group_for_testing()');
  const second = await group();
  assert.deepEqual(await titlesOf(second), ['no-paso-rojas']);

  // Un Weekend compra sus propios títulos y ampliaciones.
  await db.query('SELECT public.activate_weekend_for_testing(90)');
  const weekend = await group('weekend', 90);
  await db.query(`SELECT public.activate_group_gamification($1, ARRAY['minero'])`, [weekend]);
  await db.query(`SELECT public.activate_group_addons_for_testing($1, ARRAY['ampliacion-plantilla'])`, [weekend]);
  await db.query(`SELECT public.activate_group_addons_for_testing($1, ARRAY['temporada-simultanea'])`, [weekend]);
  const settings = (await db.query('SELECT max_players,simultaneous_season_enabled FROM groups WHERE id=$1', [weekend])).rows[0];
  assert.equal(settings.max_players, 32);
  assert.equal(settings.simultaneous_season_enabled, true);
  await db.query(`SELECT public.activate_group_addons_for_testing($1, ARRAY[]::text[])`, [weekend]);
  assert.equal((await db.query('SELECT max_players FROM groups WHERE id=$1', [weekend])).rows[0].max_players, 32);

  // Al pasar a Team conserva lo comprado como Weekend y no recibe títulos de otros Team.
  await db.query('SELECT public.convert_weekend_group_to_team($1)', [weekend]);
  assert.deepEqual(await titlesOf(weekend), ['minero', 'no-paso-rojas']);
  assert.equal((await db.query('SELECT max_players FROM groups WHERE id=$1', [weekend])).rows[0].max_players, 32);
  await db.close();
});
