import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('group gamification awards include Spanish Hands when it is enabled', async () => {
  const source = await readFile(new URL('../src/components/Statistics.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('const renderGroupGamificationAwards');
  const body = source.slice(start, source.indexOf('const renderNoPasoRojasStats'));
  // Su recuento está en spanish_hands_count y va primero, como en el catálogo.
  assert.match(body, /if \(spanishHandsEnabled\) \{[\s\S]*stat\.spanish_hands_count[\s\S]*byProduct\.set\('spanish-hand', players\)/);
  assert.match(body, /\.\.\.\(spanishHandsEnabled \? \[\{ id: 'spanish-hand', name: 'Spanish Hands' \}\] : \[\]\),\s*\.\.\.extraGamification,/);
});
