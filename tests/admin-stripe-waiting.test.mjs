import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { timeoutFetch, STRIPE_FUNCTION_TIMEOUT_MS } from '../src/utils/timeoutFetch.ts';

function capture() {
  const original = globalThis.setTimeout;
  const delays = [];
  globalThis.setTimeout = (fn, ms) => { delays.push(ms); return original(() => {}, 0); };
  return { delays, restore: () => { globalThis.setTimeout = original; } };
}

test('Stripe checkout function gets a longer client timeout than other requests', async () => {
  const timers = capture();
  try {
    const run = timeoutFetch(20000, async () => new Response('{}'));
    await run('https://x.supabase.co/functions/v1/stripe-checkout', { method: 'POST' });
    await run('https://x.supabase.co/rest/v1/user_subscriptions');
    assert.deepEqual(timers.delays, [STRIPE_FUNCTION_TIMEOUT_MS, 20000]);
  } finally { timers.restore(); }
});

test('server Stripe client fails fast per call', async () => {
  const source = await readFile(new URL('../supabase/functions/_shared/stripe.ts', import.meta.url), 'utf8');
  assert.match(source, /timeout:10000/);
  assert.match(source, /maxNetworkRetries:1/);
});

test('checkout keeps the spinner while redirecting and while waiting for the webhook', async () => {
  const source = await readFile(new URL('../src/components/PlayerCheckout.tsx', import.meta.url), 'utf8');
  assert.match(source, /OmikiSpinner/);
  assert.match(source, /Abriendo Stripe/);
  assert.match(source, /Confirmando el pago con Stripe/);
  assert.match(source, /Stripe aún no ha confirmado el pago/);
});

test('BTCPay / Lightning payment code is gone from the web', async () => {
  for (const file of ['src/App.tsx', 'src/components/MyGroups.tsx']) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /PremiumModal|PaymentSelector|lightningService/);
  }
});
