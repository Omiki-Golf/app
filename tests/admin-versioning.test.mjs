import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('app version matches the newest release and package metadata', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const source = await readFile(new URL('../src/data/releaseNotes.ts', import.meta.url), 'utf8');
  const appVersion = source.match(/APP_VERSION = '([^']+)'/)?.[1];
  const firstRelease = source.match(/version: '([^']+)'/)?.[1];
  assert.match(packageJson.version, /^\d+\.\d+\.\d+$/);
  assert.equal(appVersion, packageJson.version);
  assert.equal(firstRelease, packageJson.version);
});
