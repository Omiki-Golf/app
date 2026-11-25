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
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE test_session(uid uuid);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT uid FROM public.test_session LIMIT 1 $$;
    CREATE TABLE read_only_users(user_id uuid PRIMARY KEY);
    CREATE FUNCTION public.is_app_user_read_only() RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM public.read_only_users WHERE user_id = auth.uid()) $$;
    CREATE FUNCTION public.weekend_end_of_day(p_at timestamptz) RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path='' AS $$
      SELECT ((((p_at AT TIME ZONE 'Europe/Madrid')::date) + 1)::timestamp AT TIME ZONE 'Europe/Madrid') - interval '1 second';
    $$;
    CREATE TABLE app_administrators(user_id uuid PRIMARY KEY, alias text NOT NULL, status text NOT NULL DEFAULT 'active');
    CREATE TABLE app_admin_audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_user_id uuid, actor_alias text NOT NULL, action text NOT NULL, target_user_id uuid, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz DEFAULT now());
    CREATE TABLE user_profiles(user_id uuid PRIMARY KEY, nick text);
    CREATE TABLE user_subscriptions(user_id uuid PRIMARY KEY, plan_type text, status text, payment_hash text, current_period_start timestamptz, current_period_end timestamptz,
      team_trial_ends_at timestamptz, weekend_mode_until timestamptz, weekend7_until timestamptz, weekend90_until timestamptz, stripe_subscription_id text, updated_at timestamptz DEFAULT now());
    CREATE TABLE groups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_auth_id uuid, archived_at timestamptz, group_type text, weekend_days smallint, weekend_mode_until timestamptz);
  `);
  await db.exec(await read('../supabase/migrations/20261202100000_gift_codes.sql'));
  const as = async id => { await db.query('DELETE FROM test_session'); if (id) await db.query('INSERT INTO test_session VALUES($1)', [id]); };
  const admin = crypto.randomUUID();
  await db.query("INSERT INTO app_administrators VALUES($1,'Fede','active')", [admin]);
  const create = async (plan, duration, count = 1, expires = "now() + interval '1 month'") => {
    await as(admin);
    return (await db.query(`SELECT public.admin_create_gift_codes($1,$2,$3,${expires},'Torneo') AS codes`, [plan, duration, count])).rows[0].codes;
  };
  const redeem = async (user, code) => { await as(user); return (await db.query('SELECT public.redeem_gift_code($1) AS r', [code])).rows[0].r; };
  const sub = async user => (await db.query('SELECT * FROM user_subscriptions WHERE user_id = $1', [user])).rows[0];
  return { db, as, admin, create, redeem, sub };
}

test('admins create 8-character uppercase hexadecimal codes and non-admins cannot', async () => {
  const { db, as, create } = await database();
  const codes = await create('player', 'annual', 5);
  assert.equal(codes.length, 5);
  for (const code of codes) assert.match(code, /^[0-9A-F]{8}$/);
  assert.equal(new Set(codes).size, 5);
  await as(crypto.randomUUID());
  await assert.rejects(db.query("SELECT public.admin_create_gift_codes('team','monthly',1,now()+interval '1 day','')"), /Acceso denegado/);
  await assert.rejects(create('weekend', 'annual'), /no válidos/);
  await assert.rejects(create('player', 'annual', 1, "now() - interval '1 day'"), /futura/);
  const audit = (await db.query("SELECT details FROM app_admin_audit WHERE action = 'gift_codes.created'")).rows;
  assert.equal(audit.length, 1);
});

test('a Player annual code activates Player for a year without paying and only once', async () => {
  const { db, as, create, redeem, sub } = await database();
  const [code] = await create('player', 'annual');
  await as(null);
  assert.equal((await db.query('SELECT public.check_gift_code($1) AS c', [code.toLowerCase()])).rows[0].c.plan, 'player');
  const ana = crypto.randomUUID();
  const result = await redeem(ana, ` ${code.slice(0, 4)}-${code.slice(4).toLowerCase()} `);
  assert.equal(result.plan, 'player');
  const row = await sub(ana);
  assert.equal(row.plan_type, 'player');
  assert.equal(row.status, 'active');
  assert.equal(row.payment_hash, `gift:${code}`);
  const days = (new Date(row.current_period_end) - new Date(row.current_period_start)) / 86400000;
  assert.ok(days >= 364 && days <= 366);
  // Repetir con la misma cuenta no hace nada; otra cuenta no puede.
  assert.equal((await redeem(ana, code)).already, true);
  await assert.rejects(redeem(crypto.randomUUID(), code), /ya se ha canjeado/);
  assert.equal((await db.query('SELECT public.check_gift_code($1) AS c', [code])).rows[0].c, null);
});

test('a Team monthly code is refused while another plan is active', async () => {
  const { db, create, redeem, sub } = await database();
  const [code] = await create('team', 'monthly');
  const ana = crypto.randomUUID();
  await db.query("INSERT INTO user_subscriptions(user_id,plan_type,status,current_period_end) VALUES($1,'player','active',now()+interval '3 months')", [ana]);
  await assert.rejects(redeem(ana, code), /Ya tienes un plan Omiki activo/);
  await db.query("UPDATE user_subscriptions SET current_period_end = now() - interval '1 day' WHERE user_id = $1", [ana]);
  await redeem(ana, code);
  const row = await sub(ana);
  assert.equal(row.plan_type, 'team');
  const days = (new Date(row.current_period_end) - new Date(row.current_period_start)) / 86400000;
  assert.ok(days >= 28 && days <= 31);
});

test('Weekend codes work without a paid plan and keep one Weekend per duration', async () => {
  const { create, redeem, sub } = await database();
  const [short, other, long] = [...await create('weekend', '7d', 2), ...await create('weekend', '90d')];
  const ana = crypto.randomUUID();
  await redeem(ana, short);
  let row = await sub(ana);
  assert.equal(row.plan_type, 'express');
  assert.ok(new Date(row.weekend7_until) > new Date(Date.now() + 6 * 86400000));
  assert.equal(row.weekend90_until, null);
  await assert.rejects(redeem(ana, other), /Weekend de esa duración activo/);
  await redeem(ana, long);
  row = await sub(ana);
  assert.ok(new Date(row.weekend90_until) > new Date(Date.now() + 89 * 86400000));
  assert.equal(new Date(row.weekend_mode_until).getTime(), new Date(row.weekend90_until).getTime());
});

test('expired, revoked, unknown codes and read-only accounts are refused', async () => {
  const { db, as, create, redeem } = await database();
  const [expired] = await create('player', 'monthly');
  await db.query("UPDATE gift_codes SET expires_at = now() - interval '1 minute' WHERE code = $1", [expired]);
  await assert.rejects(redeem(crypto.randomUUID(), expired), /caducado/);
  const [revoked, used] = await create('player', 'monthly', 2);
  await db.query('SELECT public.admin_revoke_gift_code($1)', [revoked]);
  await assert.rejects(redeem(crypto.randomUUID(), revoked), /ya no es válido/);
  await assert.rejects(redeem(crypto.randomUUID(), 'ABCDEF12'), /no existe/);
  const viewer = crypto.randomUUID();
  await db.query('INSERT INTO read_only_users VALUES($1)', [viewer]);
  await assert.rejects(redeem(viewer, used), /pueda editar/);
  const bea = crypto.randomUUID();
  await db.query("INSERT INTO user_profiles VALUES($1,'Bea')", [bea]);
  await redeem(bea, used);
  await as((await db.query('SELECT user_id FROM app_administrators')).rows[0].user_id);
  await assert.rejects(db.query('SELECT public.admin_revoke_gift_code($1)', [used]), /canjeado no se puede anular/);
  const list = (await db.query("SELECT public.admin_list_gift_codes('') AS l")).rows[0].l;
  const byCode = Object.fromEntries(list.map(item => [item.code, item]));
  assert.equal(byCode[expired].status, 'expired');
  assert.equal(byCode[revoked].status, 'revoked');
  assert.equal(byCode[used].status, 'redeemed');
  assert.equal(byCode[used].redeemed_nick, 'Bea');
  assert.equal((await db.query("SELECT public.admin_list_gift_codes('redeemed') AS l")).rows[0].l.length, 1);
});

test('the gift codes table is only reachable through its functions', async () => {
  const sql = await read('../supabase/migrations/20261202100000_gift_codes.sql');
  assert.match(sql, /ALTER TABLE public\.gift_codes ENABLE ROW LEVEL SECURITY;\s*REVOKE ALL ON public\.gift_codes FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.check_gift_code\(text\) TO anon, authenticated;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.redeem_gift_code\(text\) TO authenticated;/);
});

test('registration, plans, profile and the admin portal offer gift codes', async () => {
  const form = await read('../src/components/RegistrationForm.tsx');
  assert.match(form, /¿Tienes un código regalo\?/);
  assert.match(form, /playerSignupMetadata\([^;]*gift\?\.code\)/);
  const registration = await read('../src/utils/playerRegistration.ts');
  assert.match(registration, /giftCode \? \{ gift_code: giftCode \} : \{ player_checkout: intent \}/);
  const app = await read('../src/App.tsx');
  assert.match(app, /giftCodeService\.redeem\(pendingGift\)/);
  assert.match(app, /updateUser\(\{ data: \{ gift_code: null \} \}\)/);
  assert.match(app, /setCurrentView\(withGiftCode \? 'main' : 'player-checkout'\)/);
  assert.match(await read('../src/components/PlansComparison.tsx'), /onClick=\{onGiftCode\}/);
  assert.match(await read('../src/components/ProfileScreen.tsx'), /<GiftCodeRedeem onRedeemed=\{onGiftRedeemed\} \/>/);
  const portal = await read('../src/components/admin/AdminPortal.tsx');
  assert.match(portal, /\{ id: 'giftCodes', label: 'Códigos regalo' \}/);
  const admin = await read('../src/components/admin/AdminGiftCodes.tsx');
  assert.match(admin, /giftCodeService\.adminCreate\(plan, duration, amount, until, note\)/);
  const service = await read('../src/services/giftCodeService.ts');
  assert.match(service, /weekend: \[\{ id: '7d', label: '7 días' \}, \{ id: '90d', label: '3 meses' \}\]/);
});

test('until real customers, a test button checks the code (without redeeming) and shows a toast', async () => {
  const field = await read('../src/components/GiftCodeField.tsx');
  assert.match(field, /Probar código \(pruebas\)/);
  assert.match(field, /Código correcto: \$\{giftCodeLabel/);
  assert.match(field, /Código incorrecto: no existe/);
  assert.equal(field.match(/<GiftCodeTestButton code=\{code\} \/>/g)?.length, 2);
  assert.doesNotMatch(field.slice(field.indexOf('export function GiftCodeTestButton'), field.indexOf('interface GiftCodeCheckProps')), /redeem/);
  assert.match(await read('../src/services/giftCodeService.ts'), /export const GIFT_CODE_TEST_BUTTON = true;/);
});
