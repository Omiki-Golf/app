import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const authProvider = await readFile(new URL('../src/context/AuthProvider.tsx', import.meta.url), 'utf8');

test('logout clears account-scoped group context before returning to Express', () => {
  const start = authProvider.indexOf('  const logout = async () => {');
  const end = authProvider.indexOf('\n  const refreshSubscription', start);
  assert.ok(start >= 0 && end > start);

  const logout = authProvider.slice(start, end);
  assert.match(logout, /supabase\.auth\.signOut/);
  assert.match(logout, /clearStoredAuthSession/);
  assert.match(logout, /storageUtils\.clearCurrentGroup\(\)/);
  assert.ok(
    logout.indexOf('storageUtils.clearCurrentGroup()') < logout.indexOf('setUser(null)'),
    'the stale group must be removed before the anonymous UI is rendered',
  );
});
