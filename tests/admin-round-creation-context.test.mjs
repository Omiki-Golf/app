import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const service = await readFile(new URL('../src/services/golfService.ts', import.meta.url), 'utf8');
const setup = await readFile(new URL('../src/components/RoundSetup.tsx', import.meta.url), 'utf8');
// Execute the real service method with a fake database; never connect to Supabase.
const method = service.slice(service.indexOf('  async createRound('), service.indexOf('  async getActiveRounds('));
const script = ts.transpileModule(`const service = { ${method} }; globalThis.createRound = service.createRound;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function harness() {
  let inserted;
  const database = {
    from(table) {
      assert.equal(table, 'golf_rounds');
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() { return { data: null }; },
        insert(rows) { inserted = rows[0]; return this; },
        async single() { return { data: { id: 'new-round', ...inserted }, error: null }; },
      };
    },
  };
  const context = vm.createContext({
    supabase: database,
    getRoundOwnerId: async () => 'creator',
    generateAccessCode: () => 'ABC123',
    storageUtils: { getCurrentGroupId() { throw new Error('Stale deleted group must not be used'); } },
  });
  vm.runInContext(script, context);
  return context.createRound;
}

test('quick creation ignores a stale stored group in every game mode', async () => {
  const create = harness();
  for (const mode of ['stableford', 'match', 'sindicato', 'parejas']) {
    const round = await create('course', 9, false, '1-9', undefined, mode, null);
    assert.equal(round.group_id, null);
    assert.equal(round.game_mode, mode);
    assert.equal(round.user_id, 'creator');
    assert.equal(round.num_holes, 9);
  }
});

test('group creation uses the explicit current group and preserves pairs mode', async () => {
  const round = await harness()('course', 18, false, undefined, undefined, 'parejas', 'selected-group');
  assert.equal(round.group_id, 'selected-group');
  assert.equal(round.game_mode, 'parejas');
});

test('setup passes its visible group explicitly instead of relying on device storage', () => {
  assert.match(setup, /gameMode,\s*currentGroup\?\.id \?\? null/);
});
