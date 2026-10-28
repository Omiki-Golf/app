import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { canEditRoundScores } from '../src/utils/roundEditing.ts';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
// Windows checkouts may use CRLF.
const normalized = app.replace(/\r\n/g, '\n');
const effectStart = normalized.indexOf('  useEffect(() => {\n    const roundId = roundState.round?.id;');
assert.ok(effectStart >= 0);
const effectEnd = normalized.indexOf('  // El botón de Team de la pantalla de inicio', effectStart);
assert.ok(effectEnd > effectStart);
const effect = normalized.slice(effectStart, effectEnd)
  .replace("const { supabase } = await import('./services/supabaseClient');", '');
const flush = () => new Promise(resolve => setImmediate(resolve));

test('actual open-card status subscription and focus revoke stale member editing after completion', async () => {
  for (const group_id of [null, 'group']) {
    const state = { round: { id: 'round', group_id, status: 'active', user_id: 'creator' }, isCreator: false, hasEditAccess: true };
    let remote = { ...state.round, status: 'completed' };
    let statusCallback;
    let focusCallback;
    let timerCallback;
    let writes = 0;
    const context = vm.createContext({
      roundState: state,
      currentView: 'scorecard',
      useEffect(fn) { fn(); },
      setRoundState(fn) { Object.assign(state, fn(state)); },
      setCurrentView() {},
      canEditRoundScores,
      getUserId: () => 'member',
      storageUtils: { clearActiveRound() {} },
      accessCodeStorage: { removeAccessCode() {}, hasAccessCode() { return false; }, getAccessCode() { return null; } },
      window: {
        setInterval(fn) { timerCallback = fn; return 1; },
        addEventListener(name, fn) { if (name === 'focus') focusCallback = fn; },
      },
      supabase: {
        from() { return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: remote }; } }; },
        channel() { return { on(_type, filter, fn) { assert.equal(filter.filter, 'id=eq.round'); statusCallback = fn; return this; }, subscribe() { return this; } }; },
      },
      console: { log() {}, error() {} },
      readOnly: false,
      golfService: {
        subscribeToRoundScores() { return { unsubscribe() {} }; },
        subscribeToRoundPlayers() { return { unsubscribe() {} }; },
        async getRoundScores() { return []; },
        async getRoundPlayers() { return []; },
        async recordScore() { writes++; },
        async deleteScore() { writes++; },
      },
    });
    const handlerStart = normalized.indexOf('  const handleScoreChange =');
    const handler = normalized.slice(handlerStart, normalized.indexOf('  const handleHolesUpdated', handlerStart));
    const script = ts.transpileModule(effect + handler + '\nglobalThis.scoreChange = handleScoreChange;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInContext(script, context);
    for (const trigger of [() => statusCallback(), () => focusCallback(), () => timerCallback()]) {
      state.hasEditAccess = true; // stale tab from before the creator finished
      trigger();
      await flush();
      assert.equal(state.hasEditAccess, false);
      await context.scoreChange('player', 1, { grossStrokes: 4 });
      await context.scoreChange('player', 1, null);
      assert.equal(writes, 0);
    }
    remote = { ...remote, status: 'archived' };
    statusCallback();
    await flush();
    assert.equal(state.hasEditAccess, false);
  }
});
