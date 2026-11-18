import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

// renewalNotice importa weekendMode: se cargan los dos módulos transpilados.
const loadRenewal = async () => {
  const compile = async path => ts.transpileModule(await read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const weekend = { exports: {} };
  Function('module', 'exports', await compile('../src/utils/weekendMode.ts'))(weekend, weekend.exports);
  const module = { exports: {} };
  Function('module', 'exports', 'require', await compile('../src/utils/renewalNotice.ts'))(module, module.exports, () => weekend.exports);
  return module.exports;
};

test('subscription renewal notice shows 15 days before annual and 3 before monthly plans', async () => {
  const { renewalNotice } = await loadRenewal();
  const end = '2027-11-20T12:00:00Z';
  const annual = { plan_type: 'team', status: 'active', stripe_subscription_id: 'sub_1', current_period_start: '2026-11-20T12:00:00Z', current_period_end: end };
  const monthly = { ...annual, plan_type: 'player', current_period_start: '2027-10-20T12:00:00Z' };
  const at = day => Date.parse(`2027-11-${String(day).padStart(2, '0')}T10:00:00Z`);

  assert.equal(renewalNotice(annual, undefined, at(4)), null);
  assert.deepEqual(renewalNotice(annual, undefined, at(5)), { plan: 'team', endsAt: end, daysLeft: 15, annual: true });
  assert.equal(renewalNotice(monthly, undefined, at(16)), null);
  assert.equal(renewalNotice(monthly, undefined, at(17))?.daysLeft, 3);
  // «Continúa con nosotros» lo descarta solo para ese vencimiento.
  assert.equal(renewalNotice(annual, end, at(10)), null);
  assert.ok(renewalNotice(annual, '2026-11-20T12:00:00Z', at(10)));
  // Sin Stripe (prueba Team, simulado) o inactiva: no avisa.
  assert.equal(renewalNotice({ ...annual, stripe_subscription_id: null }, undefined, at(10)), null);
  assert.equal(renewalNotice({ ...annual, status: 'canceled' }, undefined, at(10)), null);
  assert.equal(renewalNotice({ ...annual, plan_type: 'express' }, undefined, at(10)), null);
  assert.equal(renewalNotice(annual, undefined, Date.parse('2027-11-21T10:00:00Z')), null);
});

test('renewal notice appears on Home, Profile and the bell, and Darse de baja opens the account deletion', async () => {
  const [app, home, profile, bell, card, deletion, details] = await Promise.all([
    read('../src/App.tsx'),
    read('../src/components/HomeScreen.tsx'),
    read('../src/components/ProfileScreen.tsx'),
    read('../src/components/NotificationsBell.tsx'),
    read('../src/components/RenewalNoticeCard.tsx'),
    read('../src/components/DeleteAccountSection.tsx'),
    read('../src/components/ProfileDetails.tsx'),
  ]);
  for (const screen of [home, profile, bell]) assert.match(screen, /<RenewalNoticeCard renewal=\{renewal\}/);
  assert.match(card, /Continúa con nosotros/);
  assert.match(card, /Darse de baja/);
  assert.match(app, /updateUser\(\{ data: \{ renewal_notice_dismissed: renewalInfo\.endsAt \} \}\)/);
  assert.match(app, /setOpenAccountDeletion\(true\);\s*openFromProfile\('profile-details'\)/);
  assert.match(details, /autoOpen=\{openAccountDeletion\}/);
  assert.match(deletion, /if \(!autoOpen\) return;/);
  // «Ir a Mis grupos» es un botón de Omiki, no un enlace subrayado.
  assert.doesNotMatch(deletion, /className="mt-2 font-semibold underline">Ir a Mis grupos/);
  assert.match(deletion, /bg-accent[^"]*"><Users size=\{18\} aria-hidden="true" \/>Ir a Mis grupos/);
});
