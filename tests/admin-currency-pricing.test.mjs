import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatDisplayPrice, GBP_PER_EUR_APPROX } from '../src/utils/currency.ts';

test('EUR stays exact while GBP is clearly marked as an estimate', () => {
  assert.equal(GBP_PER_EUR_APPROX, 0.87);
  assert.match(formatDisplayPrice(29.99, 'EUR', 'es'), /29,99\s*€/);
  assert.match(formatDisplayPrice(29.99, 'GBP', 'en'), /^≈£26\.09$/);
});

test('all price screens share the persistent EUR/GBP selector', async () => {
  for (const file of ['PlansComparison.tsx', 'PlayerCheckout.tsx', 'ProShop.tsx']) {
    const source = await readFile(new URL(`../src/components/${file}`, import.meta.url), 'utf8');
    assert.match(source, /CurrencySelector/);
    assert.match(source, /formatDisplayPrice/);
  }
  const source = await readFile(new URL('../src/components/CurrencySelector.tsx', import.meta.url), 'utf8');
  assert.match(source, /€ EUR/);
  assert.match(source, /£ GBP/);
});

test('Stripe Checkout enables Adaptive Pricing for exact conversion', async () => {
  for (const file of ['stripe-setup/index.ts', 'stripe-checkout/index.ts']) {
    const source = await readFile(new URL(`../supabase/functions/${file}`, import.meta.url), 'utf8');
    assert.match(source, /adaptive_pricing:\{enabled:true\}/);
    assert.match(source, /locale:'auto'/);
    assert.doesNotMatch(source, /locale:'es'/);
  }
});

test('currency explanation exists in every supported language', async () => {
  const source = await readFile(new URL('../src/i18n/index.ts', import.meta.url), 'utf8');
  assert.equal((source.match(/currency: \{ label:/g) || []).length, 4);
  assert.equal((source.match(/approxShort:/g) || []).length, 4);
  assert.equal((source.match(/adaptive:/g) || []).length, 4);
});
