import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('only the creator of a group round sees Archive and Delete', async () => {
  const source = await readFile(new URL('../src/components/ActiveRoundsViewer.tsx', import.meta.url), 'utf8');
  // Cada botón de grupo de archivar o borrar exige ser el creador; «Ver Resultados Completos» no.
  const groupButtons = [...source.matchAll(/\{currentGroup( && isRoundCreator)? && \(\s*<(?:WriteButton|button)\s+onClick=\{\(\) => (setRoundToArchive|handleDeleteRoundClick|\{)/g)];
  const guarded = groupButtons.filter(match => match[2] !== '{');
  assert.equal(guarded.length, 3, 'two delete buttons and one archive button in groups');
  for (const match of guarded) assert.ok(match[1], `${match[2]} must require isRoundCreator`);
  assert.match(source, /Ver Resultados Completos/);
  // Si aun así se intenta, no se llama al servidor.
  assert.match(source, /!isVerifiedLocalRoundCreator\(target\.round\.user_id\)\) \{\s*setError\('No tienes permisos para archivar esta partida/);
});
