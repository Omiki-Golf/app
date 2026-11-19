import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
// PGlite no tiene pg_cron: se omite solo la programación de las tareas.
const withoutCron = sql => sql.replace(/CREATE EXTENSION IF NOT EXISTS pg_cron[^;]*;/g, '').replace(/SELECT cron\.schedule\([^;]*;/g, '');

async function database() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const [tiers, expiry, rules, annual] = await Promise.all([
    read('../supabase/migrations/20261117100000_group_tiers_and_purchase_scope.sql'),
    read('../supabase/migrations/20261118100000_weekend_end_of_day_and_auto_archive.sql'),
    read('../supabase/migrations/20261119100000_two_weekends_and_team_conversion.sql'),
    read('../supabase/migrations/20261124100000_annual_additional_groups.sql'),
  ]);
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE test_session(uid uuid);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT uid FROM public.test_session LIMIT 1 $$;
    CREATE FUNCTION public.is_app_user_read_only() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE TABLE app_administrators(user_id uuid PRIMARY KEY);
    CREATE TABLE user_subscriptions(user_id uuid PRIMARY KEY,plan_type text,status text,current_period_end timestamptz,team_trial_ends_at timestamptz,weekend_mode_until timestamptz,updated_at timestamptz DEFAULT now());
    CREATE TABLE groups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,group_code text,user_auth_id uuid,archived_at timestamptz,group_type text NOT NULL DEFAULT 'team',weekend_mode_until timestamptz,premium_branding boolean NOT NULL DEFAULT false,created_at timestamptz DEFAULT now(),hoyo_19_enabled boolean DEFAULT true,max_players integer DEFAULT 20,simultaneous_season_enabled boolean DEFAULT false);
    CREATE TABLE pro_shop_purchases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid,purchased_by uuid,product_type text,amount_paid numeric,payment_method text,status text,created_at timestamptz DEFAULT now());
    CREATE TABLE group_gamification(group_id uuid,product_id text,purchased boolean,enabled boolean,updated_by uuid,updated_at timestamptz DEFAULT now(),PRIMARY KEY(group_id,product_id));
    CREATE TABLE group_invitations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid,status text);
    CREATE TABLE group_members(group_id uuid,user_id uuid,role text,joined_at timestamptz DEFAULT now());
    CREATE FUNCTION public.activate_group_gamification(uuid,text[]) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  `);
  await db.exec(tiers);
  await db.exec(withoutCron(expiry));
  await db.exec(rules);
  await db.exec(withoutCron(annual));
  // Las pruebas también simulan Teams que vencieron antes de hoy.
  await db.query("UPDATE billing_rules SET starts_at = now() - interval '1 year' WHERE key = 'archive_groups_on_team_expiry'");

  const as = async id => { await db.query('DELETE FROM test_session'); await db.query('INSERT INTO test_session VALUES($1)', [id]); };
  const user = async (id, plan = 'team') => {
    await db.query('INSERT INTO auth.users VALUES($1)', [id]);
    await db.query(`INSERT INTO user_subscriptions(user_id,plan_type,status,current_period_end) VALUES($1,$2,'active',now()+interval '1 year')`, [id, plan]);
  };
  const group = async (owner, name, type = 'team', days = null) => (await db.query(
    'INSERT INTO groups(name,group_code,user_auth_id,group_type,weekend_days) VALUES($1,$1,$2,$3,$4) RETURNING id', [name, owner, type, days])).rows[0].id;
  const buy = async owner => { await as(owner); return (await db.query('SELECT public.add_additional_group_for_testing() AS n')).rows[0].n; };
  const slots = async owner => (await db.query('SELECT id, group_id, expires_at, renew, renewed_at, ended_at FROM additional_group_slots WHERE owner_id = $1 ORDER BY created_at, id', [owner])).rows;
  const archived = async id => (await db.query('SELECT archived_at FROM groups WHERE id = $1', [id])).rows[0]?.archived_at ?? null;
  return { db, as, user, group, buy, slots, archived };
}

test('each Additional Group is a yearly slot linked to the group that uses it; deleting that group frees it', async () => {
  const { db, user, group, buy, slots } = await database();
  const ana = crypto.randomUUID();
  try {
    await user(ana);
    const base = await group(ana, 'BASE');
    await assert.rejects(group(ana, 'SIN HUECO'), /no dispone de más grupos/);

    assert.equal(await buy(ana), 1);
    const [first] = await slots(ana);
    const days = (Date.parse(first.expires_at) - Date.now()) / 86_400_000;
    assert.ok(days > 364 && days < 367, 'vence a los 12 meses');
    assert.equal(first.renew, true);

    const extra = await group(ana, 'EXTRA');
    assert.equal((await slots(ana))[0].group_id, extra, 'el grupo nuevo ocupa el hueco');
    assert.equal(await buy(ana), 2);
    const third = await group(ana, 'TERCERO');
    await assert.rejects(buy(ana), /tus 2 Grupos Adicionales/);
    await assert.rejects(group(ana, 'CUARTO'), /no dispone de más grupos/);
    assert.deepEqual((await slots(ana)).map(s => s.group_id), [extra, third]);

    // El creador archiva y borra el grupo del hueco: el hueco queda libre para otro grupo.
    await db.query('UPDATE groups SET archived_at = now() WHERE id = $1', [extra]);
    await db.query('DELETE FROM groups WHERE id = $1', [extra]);
    assert.equal((await slots(ana))[0].group_id, null);
    const replacement = await group(ana, 'NUEVO');
    assert.equal((await slots(ana))[0].group_id, replacement);
    assert.ok(base);
  } finally {
    await db.close();
  }
});

test('expired Additional Groups renew (test payment) unless the creator said not to; then only that group is archived', async () => {
  const { db, as, user, group, buy, slots, archived } = await database();
  const ana = crypto.randomUUID();
  try {
    await user(ana);
    const base = await group(ana, 'BASE');
    await buy(ana); const renewing = await group(ana, 'RENUEVA');
    await buy(ana); const leaving = await group(ana, 'NO RENUEVA');
    const [keep, stop] = await slots(ana);

    await as(ana);
    await db.query('SELECT public.set_additional_group_renewal($1, false)', [stop.id]);
    const stranger = crypto.randomUUID();
    await as(stranger);
    await assert.rejects(db.query('SELECT public.set_additional_group_renewal($1, true)', [keep.id]), /ya no está activo/);

    await db.query("UPDATE additional_group_slots SET expires_at = now() - interval '1 hour' WHERE owner_id = $1", [ana]);
    await db.query('SELECT public.process_additional_groups()');

    const [renewed, ended] = await slots(ana);
    assert.ok(Date.parse(renewed.expires_at) > Date.now() + 360 * 86_400_000, 'renovado otro año');
    assert.ok(renewed.renewed_at);
    assert.equal(renewed.ended_at, null);
    assert.ok(ended.ended_at, 'el que no se renueva se cierra');
    assert.ok(await archived(leaving), 'su grupo se archiva');
    assert.equal(await archived(renewing), null);
    assert.equal(await archived(base), null);
    // Sin ese hueco ya no cabe otro grupo.
    await assert.rejects(group(ana, 'OTRO'), /no dispone de más grupos/);
  } finally {
    await db.close();
  }
});

test('when the Team plan has been expired for more than 24 h, all its Team groups are archived but Weekends keep running', async () => {
  const { db, user, group, buy, slots, archived } = await database();
  const [ana, eva] = [crypto.randomUUID(), crypto.randomUUID()];
  try {
    await user(ana);
    await user(eva);
    const base = await group(ana, 'BASE');
    await buy(ana); const extra = await group(ana, 'EXTRA');
    await db.query("UPDATE user_subscriptions SET weekend90_until = now() + interval '30 days' WHERE user_id = $1", [ana]);
    const weekend = await group(ana, 'WEEKEND', 'weekend', 90);
    const evaGroup = await group(eva, 'EVA');

    // Vencido hace 12 h: todavía no se archiva nada (margen de 24 h).
    await db.query("UPDATE user_subscriptions SET current_period_end = now() - interval '12 hours' WHERE user_id = $1", [ana]);
    await db.query('SELECT public.process_additional_groups()');
    assert.equal(await archived(base), null);

    await db.query("UPDATE user_subscriptions SET status = 'canceled', current_period_end = now() - interval '2 days' WHERE user_id = $1", [ana]);
    await db.query('SELECT public.process_additional_groups()');
    assert.ok(await archived(base));
    assert.ok(await archived(extra));
    assert.equal(await archived(weekend), null, 'el Weekend sigue hasta su fecha');
    assert.equal(await archived(evaGroup), null, 'otros usuarios no se tocan');
    assert.ok((await slots(ana)).every(slot => slot.ended_at), 'sus Grupos Adicionales se cierran');

    // Lo que venció antes de aplicar la regla no se toca.
    await db.query("UPDATE billing_rules SET starts_at = now() WHERE key = 'archive_groups_on_team_expiry'");
    await db.query("UPDATE user_subscriptions SET status = 'canceled', current_period_end = now() - interval '2 days' WHERE user_id = $1", [eva]);
    await db.query('SELECT public.process_additional_groups()');
    assert.equal(await archived(evaGroup), null);
  } finally {
    await db.close();
  }
});

test('turning a 3-month Weekend into Team uses a free slot or buys a new yearly one', async () => {
  const { db, as, user, group, slots } = await database();
  const ana = crypto.randomUUID();
  try {
    await user(ana);
    await group(ana, 'BASE');
    await db.query("UPDATE user_subscriptions SET weekend90_until = now() + interval '30 days' WHERE user_id = $1", [ana]);
    const weekend = await group(ana, 'WEEKEND', 'weekend', 90);
    await as(ana);
    assert.equal((await db.query('SELECT public.convert_weekend_group_to_team($1) AS r', [weekend])).rows[0].r, 'additional');
    const [slot] = await slots(ana);
    assert.equal(slot.group_id, weekend, 'el grupo convertido ocupa el nuevo hueco');
    assert.equal((await db.query('SELECT group_type FROM groups WHERE id = $1', [weekend])).rows[0].group_type, 'team');
  } finally {
    await db.close();
  }
});

test('the app counts only active Additional Groups and shows each renewal 15 days before, with Renew / Do not renew', async () => {
  const [service, card, home, app, shop, creation] = await Promise.all([
    read('../src/services/additionalGroups.ts'),
    read('../src/components/AdditionalGroupRenewalCard.tsx'),
    read('../src/components/HomeScreen.tsx'),
    read('../src/App.tsx'),
    read('../src/components/ProShop.tsx'),
    read('../src/components/TeamCreation.tsx'),
  ]);
  assert.match(service, /from\('additional_group_slots'\)[\s\S]*\.is\('ended_at', null\)[\s\S]*\.gt\('expires_at'/);
  assert.match(service, /ADDITIONAL_GROUP_NOTICE_DAYS = 15/);
  assert.match(service, /rpc\('set_additional_group_renewal', \{ p_slot: slotId, p_renew: renew \}\)/);
  assert.ok(card.includes('se renueva el'));
  assert.ok(card.includes('No renovar') && card.includes('Renovar'));
  assert.match(home, /additionalRenewals\.map\(item => \(\s*<AdditionalGroupRenewalCard/);
  assert.match(app, /await supabase\.rpc\('process_additional_groups'\)/);
  assert.match(app, /extraGroups = slots\.length/);
  assert.match(app, /additionalRenewals=\{additionalGroupNotices\(additionalSlots\)/);
  assert.ok(shop.includes('Tus Grupos Adicionales'));
  assert.ok(shop.includes('Ampliar Plantilla'));
  assert.match(creation, /extraCapacity = \(await loadAdditionalGroupSlots\(userId\)\)\.length/);
});

test('Ampliar Plantilla is a one-off group purchase: its price has no "/ año"', async () => {
  const shop = await read('../src/components/ProShop.tsx');
  assert.equal(shop.match(/item\.id === 'ampliacion-plantilla' \? '' : ' \/ año'/g)?.length, 2);
});
