import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const roundSetup = await readFile(new URL('../src/components/RoundSetup.tsx', import.meta.url), 'utf8');
const playerSetup = await readFile(new URL('../src/components/PlayerSetup.tsx', import.meta.url), 'utf8');

test('a 9-hole course always starts on holes 1-9, even after a 10-18 round elsewhere', () => {
  assert.match(roundSetup, /if \(holeCount === 9\) \{\s*setNumHoles\(9\);\s*setHolesRange\('1-9'\);/);
  assert.match(roundSetup, /numHoles === 9 \? \(selectedCourseHoleCount === 18 \? holesRange : '1-9'\) : undefined/, 'the round is never created as 10-18 on a 9-hole course');
});

test('the "Añadirme a la partida" suggestion stays on one line', () => {
  const button = playerSetup.slice(playerSetup.indexOf('onClick={prefillSelf}'), playerSetup.indexOf('Añadirme a la partida</span>') + 120);
  assert.match(button, /whitespace-nowrap/);
  assert.match(button, /<span className="min-w-0 truncate">\(\{account\.nick\}\)<\/span>/, 'a long nick is shortened instead of wrapping');
});

test('in a group, typing a name cannot add a player already in this or another active round', () => {
  const add = playerSetup.slice(playerSetup.indexOf('const handleAddPlayer'), playerSetup.indexOf('const handicapNum = parseFloat(handicap);'));
  assert.match(add, /if \(currentGroup\) \{/);
  assert.match(add, /players\.some\(player => normalizeName\(player\.name\) === typedName\)[\s\S]*ya está en esta partida/);
  assert.match(add, /playerNamesInActiveRounds\.some\(name => normalizeName\(name\) === typedName\)[\s\S]*ya está jugando otra partida activa del grupo/);
});
