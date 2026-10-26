import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const homeScreen = await readFile(new URL('../src/components/HomeScreen.tsx', import.meta.url), 'utf8');
const translations = await readFile(new URL('../src/i18n/index.ts', import.meta.url), 'utf8');

test('the home round button has the same create/view label for every plan', () => {
  assert.match(homeScreen, /\{t\('home\.createGame'\)\}/);
  assert.doesNotMatch(homeScreen, /isExpress\s*\?\s*t\('home\.createExpress'\)/);
  assert.match(translations, /createGame: 'Crear\/Ver partida'/);
  assert.match(translations, /createGame: 'Create\/View Round'/);
  assert.match(translations, /createGame: 'Créer\/voir une partie'/);
  assert.match(translations, /createGame: 'Crea\/vedi partita'/);
});
