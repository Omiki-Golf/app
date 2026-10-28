import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/hooks/useSubscription.ts', import.meta.url), 'utf8');
const script = ts.transpileModule(source.replace(/^import .*;\r?\n/gm, '').replace('export const useSubscription', 'globalThis.useSubscription'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function harness({ profile = { nick: 'Jugador' }, fail = false } = {}) {
  const state = [];
  let index = 0;
  let profileCalls = 0;
  let planCalls = 0;
  let user = { id: 'account', user_metadata: { registration_pending: true } };
  const context = vm.createContext({
    useState(initial) { const slot = index++; state[slot] = initial; return [initial, value => { state[slot] = value; }]; },
    useRef: value => ({ current: value }),
    useCallback: fn => fn,
    useEffect() {},
    console: { error() {} },
    supabase: { auth: { getUser: async () => ({ data: { user } }) } },
    userService: {
      async ensureProfileFromMetadata(id, metadata) {
        profileCalls++;
        assert.equal(id, 'account');
        assert.equal(metadata.registration_pending, true);
        if (fail) throw new Error('network');
        return profile;
      },
      async getProfile() { throw new Error('Duplicate profile request'); },
      async getPlanType() { planCalls++; return 'player'; },
    },
  });
  vm.runInContext(script, context);
  const hook = context.useSubscription('account');
  return { refresh: hook.refresh, state, calls: () => [profileCalls, planCalls], signOut: () => { user = null; } };
}

test('each refresh reuses the ensured profile and still checks the current plan', async () => {
  const profile = { nick: 'Jugador' };
  const h = harness({ profile });
  await h.refresh();
  await h.refresh();
  assert.deepEqual(h.calls(), [2, 2]);
  assert.equal(h.state[3], profile);
  assert.equal(h.state[0], 'player');
  assert.equal(h.state[4], 'account');
});

test('a newly provisioned profile is used immediately and a missing profile remains null', async () => {
  for (const profile of [{ nick: 'Nuevo' }, null]) {
    const h = harness({ profile });
    await h.refresh();
    assert.equal(h.state[3], profile);
    assert.deepEqual(h.calls(), [1, 1]);
  }
});

test('profile errors fail closed without a plan request', async () => {
  const h = harness({ fail: true });
  await h.refresh();
  assert.equal(h.state[0], 'express');
  assert.equal(h.state[4], null);
  assert.equal(h.state[2], false);
  assert.deepEqual(h.calls(), [1, 0]);
});

test('signing out clears the prior profile without further profile or plan requests', async () => {
  const h = harness();
  await h.refresh();
  h.signOut();
  await h.refresh();
  assert.equal(h.state[3], null);
  assert.equal(h.state[0], 'express');
  assert.deepEqual(h.calls(), [1, 1]);
});
