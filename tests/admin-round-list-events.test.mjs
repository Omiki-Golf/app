import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { shouldRefreshRoundList } from '../src/utils/roundListEvents.ts';

const ids = new Set(['visible']);
const change = (group_id, id = 'other', eventType = 'UPDATE') => ({ eventType, new: { id, group_id } });

test('only clearly unrelated inserts and updates skip refresh', () => {
  assert.equal(shouldRefreshRoundList(change('other-group'), 'our-group', ids, true), false);
  assert.equal(shouldRefreshRoundList(change(null), 'our-group', ids, true), false);
  assert.equal(shouldRefreshRoundList(change('other-group'), null, ids, true), false);
  assert.equal(shouldRefreshRoundList(change('our-group'), 'our-group', ids, true), true);
  assert.equal(shouldRefreshRoundList(change(null), null, ids, true), true);
});

test('visible rounds always refresh across completion, archive, withdrawal and group changes', () => {
  for (const status of ['completed', 'archived', 'active']) {
    const event = change('other-group', 'visible');
    event.new.status = status;
    assert.equal(shouldRefreshRoundList(event, 'our-group', ids, true), true);
    assert.equal(shouldRefreshRoundList(event, null, ids, true), true);
  }
  assert.equal(shouldRefreshRoundList({ ...change('other-group'), old: { group_id: 'our-group' } }, 'our-group', ids, true), true);
  assert.equal(shouldRefreshRoundList({ ...change('other-group'), old: { group_id: null } }, null, ids, true), true);
});

test('deletes, incomplete events and events before initial load retain reload behavior', () => {
  for (const event of [null, {}, { eventType: 'UPDATE' }, { eventType: 'UPDATE', new: { id: 'other' } }, { eventType: 'UPDATE', new: { id: 'other', group_id: 3 } }, { eventType: 'DELETE', old: { id: 'other' } }]) {
    assert.equal(shouldRefreshRoundList(event, 'our-group', ids, true), true);
  }
  assert.equal(shouldRefreshRoundList(change('other-group'), 'our-group', ids, false), true);
});

test('actual viewer subscription keeps initial load and skips only unrelated refreshes', async () => {
  const source = await readFile(new URL('../src/components/ActiveRoundsViewer.tsx', import.meta.url), 'utf8');
  const effect = source.slice(source.indexOf('  useEffect(() => {'), source.indexOf('  const loadActiveRounds ='));
  let loads = 0;
  let callback;
  let cleanup;
  let unsubscribed = false;
  const listSnapshot = { current: { loaded: false, ids: new Set() } };
  const listGroupId = { current: 'our-group' };
  vm.runInNewContext(ts.transpileModule(effect, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    useEffect(fn) { cleanup = fn(); },
    listSnapshot,
    listGroupId,
    currentGroup: { id: 'our-group' },
    loadActiveRounds() { loads++; listSnapshot.current = { loaded: true, ids }; },
    shouldRefreshRoundList,
    golfService: { subscribeToRounds(fn) { callback = fn; return { unsubscribe() { unsubscribed = true; } }; } },
  });
  assert.equal(loads, 1);
  callback(change('other-group'));
  assert.equal(loads, 1);
  callback({ ...change('our-group', 'visible'), new: { id: 'visible', group_id: 'our-group', status: 'completed' } });
  callback({ eventType: 'DELETE', old: { id: 'visible' } });
  assert.equal(loads, 3);
  listGroupId.current = 'new-group';
  callback(change('other-group'));
  assert.equal(loads, 4, 'context changes must not filter using an old subscription closure');
  cleanup();
  assert.equal(unsubscribed, true);
});
