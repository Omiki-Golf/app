import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { activateSimulation, periodEnd, playerIntent, playerSignupMetadata, registrationError } from '../src/utils/playerRegistration.ts';

const uid = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const intent = { id: '11111111-1111-4111-8111-111111111111', period: 'annual' };
const fields = { nick: 'Prueba', email: 'test@example.com', password: 'Test!123', handicap: '', age: '', over14: true, acceptedTerms: true };
test('Player registration validates credentials, age consistency and billing dates', () => {
  assert.equal(registrationError(fields), null);
  for (const patch of [{email:''},{password:''},{password:'abcdef'},{age:'13'},{age:'20.5'},{handicap:'NaN'},{over14:false},{acceptedTerms:false}]) assert.ok(registrationError({...fields,...patch}));
  assert.equal(periodEnd(new Date('2028-02-29T12:00:00Z'), 'annual'), '2029-02-28T12:00:00.000Z');
  assert.equal(periodEnd(new Date('2026-01-31T12:00:00Z'), 'monthly'), '2026-02-28T12:00:00.000Z');
  assert.equal(playerIntent({player_checkout:{...intent,period:'weekly'}}), null);
  assert.equal(playerIntent({player_checkout:{...intent,plan:'invalid'}}), null);
  assert.deepEqual(playerIntent({player_checkout:intent}), intent); // Pending Player registrations remain compatible.
});
for (const plan of ['player', 'team', 'premium']) for (const period of ['monthly', 'annual']) test(`${plan} ${period}: no early activation, concurrent retries and existing plan protection`, async () => {
  const intent = { id: '11111111-1111-4111-8111-111111111111', plan, period };
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,raw_user_meta_data jsonb);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.uid',true),'')::uuid $$;
      CREATE TABLE user_subscriptions(user_id uuid PRIMARY KEY,plan_type text NOT NULL CHECK(plan_type IN ('free','express','player','team','premium')),status text,payment_hash text,current_period_start timestamptz,current_period_end timestamptz,updated_at timestamptz);
      GRANT USAGE ON SCHEMA auth,public TO authenticated;`);
    const historical = await readFile(new URL('../supabase/migrations/20260910190000_create_app_administration.sql',import.meta.url),'utf8');
    const fn = historical.slice(historical.indexOf('CREATE OR REPLACE FUNCTION public.create_subscription_from_signup_plan()'), historical.indexOf('CREATE TABLE public.app_administrators'));
    await db.exec(fn);
    await db.exec('CREATE TRIGGER signup AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.create_subscription_from_signup_plan()');
    const metadata = playerSignupMetadata(intent,{...fields,displayName:'',avatarUrl:'avatar.png',country:'España',postalCode:''});
    await db.query('INSERT INTO auth.users VALUES($1,$2)',[uid,JSON.stringify(metadata)]);
    assert.equal((await db.query('SELECT * FROM user_subscriptions')).rows.length,0);
    assert.deepEqual(playerIntent(metadata),intent);
    const policy = await readFile(new URL('../supabase/migrations/20260908120000_allow_users_manage_own_subscription.sql',import.meta.url),'utf8');
    await db.exec(policy);
    await db.exec(`SET ROLE authenticated; SET request.uid='${uid}'`);
    const store = {
      read: async () => (await db.query('SELECT * FROM user_subscriptions WHERE user_id=$1',[uid])).rows[0] || null,
      insertOnce: row => db.query(`INSERT INTO user_subscriptions(user_id,plan_type,status,payment_hash,current_period_start,current_period_end,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id) DO NOTHING`,Object.values(row)),
    };
    const now = new Date('2026-09-22T12:00:00Z');
    const [a,b] = await Promise.all([activateSimulation(store,uid,intent,now),activateSimulation(store,uid,intent,new Date('2026-09-23T12:00:00Z'))]);
    assert.equal(a.plan_type,plan);
    assert.ok(a.payment_hash.startsWith(`${plan}-simulation:`));
    assert.equal(new Date(a.current_period_end).toISOString(), periodEnd(new Date(a.current_period_start),period));
    assert.equal(new Date(a.current_period_end).toISOString(),new Date(b.current_period_end).toISOString());
    const again = await activateSimulation(store,uid,intent,new Date('2026-09-24T12:00:00Z'));
    assert.equal(new Date(a.current_period_end).toISOString(),new Date(again.current_period_end).toISOString());
    await assert.rejects(activateSimulation(store,uid,{...intent,id:other},now));
    await assert.rejects(store.insertOnce({...a,user_id:other}));
    await db.exec("UPDATE user_subscriptions SET plan_type='team',payment_hash='existing-payment'");
    await assert.rejects(activateSimulation(store,uid,intent,now));
    assert.equal((await store.read()).plan_type,'team');
    await db.exec('DELETE FROM user_subscriptions').catch(() => {});
    // A network failure after a successful insert must not extend the period on retry.
    await db.exec('RESET ROLE; DELETE FROM user_subscriptions');
    let failed = false;
    const flaky = { ...store, insertOnce: async row => { await store.insertOnce(row); if (!failed) {failed=true;throw new Error('Connection lost');} } };
    await assert.rejects(activateSimulation(flaky,uid,{...intent,period:'monthly'},now),/Connection lost/);
    const restored = await activateSimulation(store,uid,{...intent,period:'monthly'},new Date('2026-09-25T12:00:00Z'));
    assert.equal(new Date(restored.current_period_end).toISOString(),'2026-10-22T12:00:00.000Z');
  } finally { await db.close(); }
});
