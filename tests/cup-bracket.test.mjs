import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateCupBracket } from '../src/utils/cupBracket.ts';
import { recordCupResult } from '../src/utils/cupResults.ts';

test('every supported size gives the expected number of byes and first-round matches', () => {
  for (let count = 4; count <= 32; count++) {
    const entrants = Array.from({ length: count }, (_, index) => ({
      id: String(index + 1), rank: index < count - 2 ? index + 1 : undefined, playingHandicap: index,
    }));
    const bracket = generateCupBracket(entrants, { capacity: 32, method: 'ranking', bestOf: 1 });
    const size = 2 ** Math.ceil(Math.log2(count));
    const opening = bracket.slice(0, size / 2);
    assert.equal(opening.filter(tie => tie.players.includes(null)).length, size - count);
    assert.ok(opening.some(tie => tie.players.includes(String(count)) && tie.players.includes(String(count - 1))));
  }
});

test('a Bo3 advances after two wins and an administrator can correct the next slot', () => {
  const entrants = ['a', 'b', 'c', 'd'].map(id => ({ id, playingHandicap: 0 }));
  const initial = generateCupBracket(entrants, {
    capacity: 20, method: 'manual', bestOf: 3, finalBestOf: 1, manualSlots: ['a', 'b', 'c', 'd'],
  });
  const score = winner => ({ winner, score: '2&1' });
  const one = recordCupResult(initial, '0-0', 1, score('a'), false);
  assert.equal(one[2].players[0], null);
  const two = recordCupResult(one, '0-0', 2, score('a'), false);
  assert.equal(two[2].players[0], 'a');
  assert.throws(() => recordCupResult(two, '0-0', 2, score('b'), false));
  const corrected = recordCupResult(two, '0-0', 2, score('b'), true);
  assert.equal(corrected[2].players[0], null);
  const three = recordCupResult(corrected, '0-0', 3, score('b'), false);
  assert.equal(three[2].players[0], 'b');
  three[2].started = true;
  assert.throws(() => recordCupResult(three, '0-0', 3, score('a'), true));
});

const pairsOf = bracket => bracket.filter(tie => tie.id.startsWith('0-')).map(tie => tie.players);

test('automatic draws never pair two guests without an account in the first round', () => {
  for (let count = 4; count <= 32; count++) {
    for (let guests = 0; guests <= Math.floor(count / 2); guests++) {
      // Los invitados son los de PJ más alto y sin ranking: la siembra tendería a juntarlos.
      const entrants = Array.from({ length: count }, (_, index) => ({
        id: String(index + 1), playingHandicap: index, guest: index >= count - guests,
        rank: index < count - guests ? index + 1 : undefined,
      }));
      const guestIds = new Set(entrants.filter(entrant => entrant.guest).map(entrant => entrant.id));
      for (const method of ['random', 'ranking', 'handicap']) {
        const bracket = generateCupBracket(entrants, { capacity: 32, method, bestOf: 1 });
        const ids = pairsOf(bracket).flat().filter(Boolean);
        assert.equal(new Set(ids).size, count, `${method} ${count}/${guests}: todos colocados una vez`);
        for (const [a, b] of pairsOf(bracket)) {
          assert.ok(!(a && b && guestIds.has(a) && guestIds.has(b)), `${method} ${count}/${guests}: ${a} vs ${b}`);
        }
      }
    }
  }
});

test('a draw with more guests than registered players or a manual guest pair is rejected', () => {
  const entrants = ['a', 'b', 'c', 'd', 'e'].map((id, index) => ({ id, playingHandicap: 0, guest: index >= 2 }));
  assert.throws(() => generateCupBracket(entrants, { capacity: 20, method: 'random', bestOf: 1 }), /más invitados/);
  const balanced = ['a', 'b', 'c', 'd'].map((id, index) => ({ id, playingHandicap: 0, guest: index >= 2 }));
  assert.throws(() => generateCupBracket(balanced, { capacity: 20, method: 'manual', bestOf: 1, manualSlots: ['a', 'b', 'c', 'd'] }), /cruce 2/);
  const ok = generateCupBracket(balanced, { capacity: 20, method: 'manual', bestOf: 1, manualSlots: ['a', 'c', 'b', 'd'] });
  assert.deepEqual(pairsOf(ok), [['a', 'c'], ['b', 'd']]);
});
