import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Weekend grants Team access until its exact expiry without downgrading Premium', async () => {
  const source = await read('../src/utils/effectivePlan.ts');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  Function('module', 'exports', js)(module, module.exports);
  const { effectivePlan } = module.exports;
  const now = Date.parse('2026-11-11T10:00:00Z');
  assert.equal(effectivePlan({ plan_type: 'express', status: 'active', weekend_mode_until: '2026-11-18T10:00:00Z' }, now), 'team');
  assert.equal(effectivePlan({ plan_type: 'express', status: 'active', weekend_mode_until: '2026-11-11T10:00:00Z' }, now), 'express');
  assert.equal(effectivePlan({ plan_type: 'premium', status: 'active', weekend_mode_until: '2026-11-18T10:00:00Z' }, now), 'premium');
});

test('Weekend and every Pro-Shop add-on are wired to test activation and server limits', async () => {
  const [plans, shop, creation, migration] = await Promise.all([
    read('../src/components/PlansComparison.tsx'),
    read('../src/components/ProShop.tsx'),
    read('../src/components/TeamCreation.tsx'),
    read('../supabase/migrations/20261111100000_enable_weekend_and_pro_shop_addons.sql'),
  ]);
  assert.match(plans, /onStartWeekend\(weekendDays\)/);
  assert.match(shop, /activate_group_addons_for_testing/);
  for (const product of ['grupo-adicional', 'ampliacion-plantilla', 'temporada-simultanea']) {
    assert.match(shop, new RegExp(product));
    assert.match(migration, new RegExp(product));
  }
  assert.match(creation, /extraCapacity/);
  assert.match(migration, /THEN 32 ELSE 20/);
  assert.match(migration, /SELECT max_players INTO v_limit/);
  assert.match(migration, /activate_weekend_for_testing/);
});

test('Weekend asks Express or signed-out users for a paid plan instead of opening sign-in', async () => {
  const [plans, i18n] = await Promise.all([read('../src/components/PlansComparison.tsx'), read('../src/i18n/plans.ts')]);
  assert.match(plans, /if \(!hasPaidPlan \|\| !onStartWeekend\) \{ setWeekendNeedsPlan\(true\); return; \}/);
  assert.doesNotMatch(plans, /if \(!onStartWeekend\) \{ onShowAuth/);
  assert.match(plans, /setSelected\('player'\)/);
  assert.equal(i18n.match(/weekendNeedsPlan:/g)?.length, 4);
  assert.match(i18n, /Para activar Omiki Weekend necesitas estar suscrito a un plan Omiki: Player o Team\./);
});

test('the server only activates Weekend on a current Player, Team or Premium plan', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const migration = await read('../supabase/migrations/20261116110000_weekend_requires_paid_plan.sql');
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE test_session(uid uuid);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT uid FROM public.test_session LIMIT 1 $$;
    CREATE FUNCTION public.is_app_user_read_only() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE TABLE user_subscriptions(user_id uuid PRIMARY KEY,plan_type text,status text,current_period_start timestamptz,
      current_period_end timestamptz,weekend_mode_until timestamptz,updated_at timestamptz);
  `);
  await db.exec(migration);
  const as = async (uid) => { await db.query('DELETE FROM test_session'); await db.query('INSERT INTO test_session VALUES($1)', [uid]); };
  const activate = () => db.query('SELECT public.activate_weekend_for_testing(7) AS until');
  const express = '00000000-0000-0000-0000-0000000000e1';
  const noPlan = '00000000-0000-0000-0000-0000000000e2';
  const player = '00000000-0000-0000-0000-0000000000e3';
  const expired = '00000000-0000-0000-0000-0000000000e4';
  await db.query(`INSERT INTO user_subscriptions(user_id,plan_type,status,current_period_end) VALUES
    ($1,'express','active',NULL),($2,'player','active',now() + interval '1 month'),($3,'team','active',now() - interval '1 day')`, [express, player, expired]);

  for (const uid of [express, noPlan, expired]) {
    await as(uid);
    await assert.rejects(activate(), /necesitas estar suscrito a un plan Omiki: Player o Team/);
  }
  // Sin suscripción no se crea una cuenta Express con Weekend.
  assert.equal((await db.query('SELECT 1 FROM user_subscriptions WHERE user_id=$1', [noPlan])).rows.length, 0);

  await as(player);
  await activate();
  const { rows } = await db.query('SELECT weekend_mode_until > now() AS active FROM user_subscriptions WHERE user_id=$1', [player]);
  assert.equal(rows[0].active, true);

  const plans = await read('../src/components/PlansComparison.tsx');
  assert.match(plans, /if \(\/Player o Team\/\.test\(message\)\) setWeekendNeedsPlan\(true\);/);
  await db.close();
});

test('Mis datos de registro only accepts whole handicaps and explains why', async () => {
  const [details, i18n] = await Promise.all([read('../src/components/ProfileDetails.tsx'), read('../src/i18n/index.ts')]);
  assert.doesNotMatch(details, /inputMode="decimal"/);
  assert.doesNotMatch(details, /step="0\.1"/);
  assert.match(details, /raw\.replace\(\/\\D\/g, ''\)\.slice\(0, 2\)/);
  assert.equal(details.match(/onKeyDown=\{blockNonDigits\}/g)?.length, 2);
  assert.match(details, /t\('profile\.noDecimals'\)/);
  assert.equal(i18n.match(/noDecimals:/g)?.length, 4);
  assert.match(i18n, /Aquí los decimales no son para nosotros/);
});

test('Weekend and Grupo adicional each allow one more owned group alongside the plan group', async () => {
  const source = await read('../src/utils/groupCapacity.ts');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  Function('module', 'exports', js)(module, module.exports);
  const { nextGroupKind } = module.exports;
  const now = Date.parse('2026-11-14T10:00:00Z');
  const team = { group_type: 'team', weekend_mode_until: null };
  const weekendGroup = { group_type: 'weekend', weekend_mode_until: '2026-11-18T10:00:00Z' };
  const until = '2026-11-18T10:00:00Z';
  // Team con su grupo: Weekend sigue disponible como extra.
  assert.equal(nextGroupKind({ ownedGroups: [team], extraGroups: 0, weekend7Until: until, hasTeamPlan: true, now }), 'weekend7');
  // Con el grupo Weekend ya creado no hay otro Weekend; el del plan sigue ocupado.
  assert.equal(nextGroupKind({ ownedGroups: [team, weekendGroup], extraGroups: 0, weekend7Until: until, hasTeamPlan: true, now }), null);
  // Grupo adicional: un segundo grupo de plan, sin contar el Weekend.
  assert.equal(nextGroupKind({ ownedGroups: [team, weekendGroup], extraGroups: 1, weekend7Until: until, hasTeamPlan: true, now }), 'team');
  assert.equal(nextGroupKind({ ownedGroups: [team, team], extraGroups: 1, hasTeamPlan: true, now }), null);
  // Solo Weekend (sin plan Team): un único grupo, el Weekend.
  assert.equal(nextGroupKind({ ownedGroups: [], extraGroups: 0, weekend7Until: until, hasTeamPlan: false, now }), 'weekend7');
  assert.equal(nextGroupKind({ ownedGroups: [weekendGroup], extraGroups: 0, weekend7Until: until, hasTeamPlan: false, now }), null);

  // Premium solo tiene un grupo rosa; cualquier capacidad adicional crea Team verde.
  const premium = { group_type: 'team', weekend_mode_until: null, premium_branding: true };
  assert.equal(nextGroupKind({ ownedGroups: [], extraGroups: 0, hasTeamPlan: true, hasPremiumPlan: true, now }), 'premium');
  assert.equal(nextGroupKind({ ownedGroups: [premium], extraGroups: 1, hasTeamPlan: true, hasPremiumPlan: true, now }), 'team');
});

test('server keeps Weekend groups outside the plan capacity and the home offers the next group', async () => {
  const [migration, app, home, members] = await Promise.all([
    read('../supabase/migrations/20261114100000_weekend_group_outside_plan_capacity.sql'),
    read('../src/App.tsx'),
    read('../src/components/HomeScreen.tsx'),
    read('../src/components/GroupMemberList.tsx'),
  ]);
  assert.match(migration, /g\.group_type IS DISTINCT FROM 'weekend'/);
  assert.match(migration, /NEW\.weekend_mode_until:=v_weekend_until/);
  assert.match(migration, /UPDATE OF user_auth_id,archived_at,group_type/);
  assert.match(app, /createGroupKind=\{nextGroupKind\(/);
  // El botón de crear va en «Tus grupos» o, si toca un Weekend, en «Tus Weekends».
  assert.match(home, /\{canCreateGroup && !weekend && createButton\}/);
  assert.match(home, /\{canCreateGroup && weekend && createButton\}/);
  assert.match(members, /\$\{rosterCount\} de \$\{maxPlayers\}/);
});

test('database trigger allows the Weekend group and Grupo adicional next to the plan group', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const migration = await read('../supabase/migrations/20261114100000_weekend_group_outside_plan_capacity.sql');
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE groups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_auth_id uuid,archived_at timestamptz,group_type text NOT NULL DEFAULT 'team',weekend_mode_until timestamptz);
    CREATE TABLE user_subscriptions(user_id uuid PRIMARY KEY,weekend_mode_until timestamptz);
    CREATE TABLE pro_shop_purchases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid,product_type text,status text);
  `);
  await db.exec(migration);
  const owner = '00000000-0000-0000-0000-000000000001';
  const insert = (type, until = null) => db.query('INSERT INTO groups(user_auth_id,group_type,weekend_mode_until) VALUES($1,$2,$3) RETURNING id,weekend_mode_until', [owner, type, until]);
  const plan = await insert('team');
  await assert.rejects(insert('team'), /más grupos activos/);
  await assert.rejects(insert('weekend'), /Weekend activo/);
  await db.query(`INSERT INTO user_subscriptions VALUES($1, now() + interval '7 days')`, [owner]);
  // El cliente no decide la fecha de fin del grupo Weekend.
  const weekend = await insert('weekend', '2099-01-01T00:00:00Z');
  assert.notEqual(new Date(weekend.rows[0].weekend_mode_until).getUTCFullYear(), 2099);
  await assert.rejects(insert('weekend'), /grupo Weekend activo/);
  await db.query(`INSERT INTO pro_shop_purchases(group_id,product_type,status) VALUES($1,'grupo-adicional','completed')`, [plan.rows[0].id]);
  await insert('team');
  await assert.rejects(insert('team'), /más grupos activos/);
  await db.close();
});

test('group rounds keep personal handicap separate and Pro-Shop separates account and group scope', async () => {
  const [setup, i18n, shop, home] = await Promise.all([
    read('../src/components/PlayerSetup.tsx'),
    read('../src/i18n/index.ts'),
    read('../src/components/ProShop.tsx'),
    read('../src/components/HomeScreen.tsx'),
  ]);
  assert.match(setup, /if \(addingSelf && !currentGroup\) \{/);
  assert.match(i18n, /No afectan a los grupos: en cada grupo tienes tus PJ por separado\./);
  assert.doesNotMatch(i18n, /Cada grupo guarda el tuyo por separado/);
  assert.doesNotMatch(shop, /¿Para qué grupo\?/);
  assert.match(shop, /Configurar grupo/);
  assert.match(shop, /rpc\('activate_group_gamification', \{ p_group: groupId/);
  assert.doesNotMatch(shop, /activate_account_gamification/);
  assert.match(shop, /rpc\('add_additional_group_for_testing'\)/);
  assert.match(shop, /Pasar a Team completo/);
  assert.match(shop, /onClick=\{onUpgradeTeam\}/);
  assert.doesNotMatch(shop, /Weekend solo permite un grupo temporal/);
  assert.doesNotMatch(shop, /alsoApplyTo/);
  assert.match(home, /const tier = groupTier\(group\)/);
  assert.match(home, /const tone = tierColors\[tier\]/);
});

test('Premium keeps one pink group and additional capacity creates green Team groups', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const migration = await read('../supabase/migrations/20261117100000_group_tiers_and_purchase_scope.sql');
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE test_session(uid uuid);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT uid FROM public.test_session LIMIT 1 $$;
    CREATE FUNCTION public.is_app_user_read_only() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE TABLE user_subscriptions(user_id uuid PRIMARY KEY,plan_type text,status text,current_period_end timestamptz,team_trial_ends_at timestamptz,weekend_mode_until timestamptz);
    CREATE TABLE groups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_auth_id uuid,archived_at timestamptz,group_type text NOT NULL DEFAULT 'team',weekend_mode_until timestamptz,premium_branding boolean NOT NULL DEFAULT false,created_at timestamptz DEFAULT now(),hoyo_19_enabled boolean DEFAULT true,max_players integer DEFAULT 20,simultaneous_season_enabled boolean DEFAULT false);
    CREATE TABLE pro_shop_purchases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid,purchased_by uuid,product_type text,amount_paid numeric,payment_method text,status text);
    CREATE TABLE group_gamification(group_id uuid,product_id text,purchased boolean,enabled boolean,updated_by uuid,updated_at timestamptz DEFAULT now(),PRIMARY KEY(group_id,product_id));
    CREATE FUNCTION public.activate_group_gamification(uuid,text[]) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  `);
  await db.exec(migration);
  const owner = '00000000-0000-0000-0000-000000000091';
  await db.query('INSERT INTO test_session VALUES($1)', [owner]);
  await db.query(`INSERT INTO user_subscriptions(user_id,plan_type,status,current_period_end) VALUES($1,'premium','active',now()+interval '1 year')`, [owner]);
  const first = await db.query(`INSERT INTO groups(user_auth_id) VALUES($1) RETURNING id,premium_branding`, [owner]);
  assert.equal(first.rows[0].premium_branding, true);
  await db.query('SELECT public.set_additional_group_for_testing(true)');
  const second = await db.query(`INSERT INTO groups(user_auth_id) VALUES($1) RETURNING premium_branding`, [owner]);
  assert.equal(second.rows[0].premium_branding, false);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM pro_shop_purchases WHERE product_type='grupo-adicional'`)).rows[0].n, 1);
  await db.close();
});
