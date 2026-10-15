import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isExistingAccountSignup } from '../src/utils/playerRegistration.ts';

test('detects a signup for an email that already has an account', () => {
  // Protección contra enumeración: usuario devuelto sin identidades y sin correo enviado.
  assert.equal(isExistingAccountSignup({ identities: [] }, null), true);
  // Sin protección: Supabase responde con error explícito.
  assert.equal(isExistingAccountSignup(null, { message: 'User already registered' }), true);
});

test('a genuine new signup is not treated as an existing account', () => {
  assert.equal(isExistingAccountSignup({ identities: [{ id: 'email' }] }, null), false);
  assert.equal(isExistingAccountSignup({}, null), false);
  assert.equal(isExistingAccountSignup(null, { message: 'Password should be at least 6 characters' }), false);
  assert.equal(isExistingAccountSignup(null, null), false);
});
