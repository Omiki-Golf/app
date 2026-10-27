import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { buildCourseSearchCatalog } from '../scripts/generate-course-search.mjs';

const source = await readFile(new URL('../src/data/recorridos-golf-espana.json', import.meta.url), 'utf8');
const original = JSON.parse(source);
const light = buildCourseSearchCatalog(original);

test('search catalog preserves every club, filter, route name, variant and database key', () => {
  assert.equal(light.campos.length, 435);
  let routes = 0;
  for (const [index, club] of original.campos.entries()) {
    const projected = light.campos[index];
    for (const field of ['codigo', 'campo', 'comunidad_autonoma', 'provincia']) {
      assert.equal(projected[field], club[field]);
    }
    assert.equal(projected.recorridos.length, club.recorridos.length);
    for (const [routeIndex, route] of club.recorridos.entries()) {
      const match = projected.recorridos[routeIndex];
      assert.equal(match.recorrido, route.recorrido);
      assert.equal(match.variante, route.variante);
      assert.equal(`${projected.codigo}:${routeIndex}`, `${club.codigo}:${routeIndex}`);
      routes++;
    }
  }
  assert.equal(routes, 895);
});

test('search payload excludes hole details and source metadata, retaining clubs with no routes', () => {
  for (const club of light.campos) {
    assert.deepEqual(Object.keys(club).sort(), ['campo', 'codigo', 'comunidad_autonoma', 'provincia', 'recorridos']);
    for (const route of club.recorridos) {
      assert.ok(Object.keys(route).every(key => ['recorrido', 'variante'].includes(key)));
    }
  }
  assert.equal(light.campos.filter(club => !club.recorridos.length).length, original.campos.filter(club => !club.recorridos.length).length);
  const payload = JSON.stringify(light);
  assert.ok(Buffer.byteLength(payload) < Buffer.byteLength(source) / 4);
  assert.ok(gzipSync(payload).length < gzipSync(source).length / 2);
});

test('generation is deterministic and leaves original hole data intact', () => {
  const snapshot = JSON.stringify(original);
  assert.deepEqual(buildCourseSearchCatalog(original), light);
  assert.equal(JSON.stringify(original), snapshot);
  assert.equal(original.campos.flatMap(club => club.recorridos).reduce((count, route) => count + route.hoyos.length, 0), 16110);
});
