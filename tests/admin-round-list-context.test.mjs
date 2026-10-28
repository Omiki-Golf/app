import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/services/golfService.ts', import.meta.url), 'utf8');
const start = source.indexOf('  async getActiveRounds(');
const end = source.indexOf('\nasync hasActiveQuickPlayRound()', start);
assert.ok(start >= 0 && end > start);
const method = source.slice(start, end).trim().replace(/,$/, '');
const script = ts.transpileModule(`const golfService = { ${method} }; globalThis.golfService = golfService;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function createHarness({ session, storedGroupId, rounds = [] }) {
  const calls = [];
  const supabase = {
    auth: { async getSession() { return { data: { session } }; } },
    async rpc(name, args) {
      calls.push({ type: 'rpc', name, args });
      return { data: rounds, error: null };
    },
    from(table) {
      const filters = [];
      const query = {
        select(value) { calls.push({ type: 'select', table, value }); return query; },
        eq(column, value) { filters.push(['eq', column, value]); return query; },
        is(column, value) { filters.push(['is', column, value]); return query; },
        in(column, value) { filters.push(['in', column, value]); return query; },
        order(column, options) {
          calls.push({ type: 'query', table, filters, order: [column, options] });
          return Promise.resolve({ data: rounds, error: null });
        },
      };
      return query;
    },
  };
  const context = vm.createContext({
    supabase,
    storageUtils: { getCurrentGroupId: () => storedGroupId },
    getUserId: () => 'express-owner',
  });
  vm.runInContext(script, context);
  return { service: context.golfService, calls };
}

test('quick-round list follows the explicit current screen, not a stale stored group', async () => {
  const { service, calls } = createHarness({
    session: { user: { id: 'player-user' } },
    storedGroupId: 'old-group',
    rounds: [{ id: 'quick-round', group_id: null, status: 'active' }],
  });

  const result = await service.getActiveRounds(null);

  assert.equal(result[0].id, 'quick-round');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'rpc');
  assert.equal(calls[0].name, 'list_my_quick_rounds');
  assert.deepEqual(Array.from(calls[0].args.p_statuses), ['active', 'completed']);
});

test('group round list uses the explicit group context', async () => {
  const { service, calls } = createHarness({
    session: { user: { id: 'player-user' } },
    storedGroupId: 'old-group',
    rounds: [{ id: 'group-round', group_id: 'current-group', status: 'active' }],
  });

  const result = await service.getActiveRounds('current-group');
  const query = calls.find(call => call.type === 'query');

  assert.equal(result[0].id, 'group-round');
  assert.ok(query.filters.some(filter => filter[0] === 'eq' && filter[1] === 'group_id' && filter[2] === 'current-group'));
  assert.ok(!query.filters.some(filter => filter[1] === 'old-group'));
});
