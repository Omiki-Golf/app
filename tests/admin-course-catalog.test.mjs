import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const catalog = JSON.parse(await readFile(new URL('../src/data/recorridos-golf-espana.json', import.meta.url), 'utf8'));
const valencianCatalog = JSON.parse(await readFile(new URL('../src/data/recorridos-golf-comunidad-valenciana.json', import.meta.url), 'utf8'));
const compact = cards => {
  const routes = new Map();
  for (const card of cards) {
    const holes = card.hoyos.map(hole => ({ hoyo: hole.hoyo, par: hole.par, dificultad: hole.handicap }));
    const key = `${card.recorrido}\0${JSON.stringify(holes)}`;
    if (!routes.has(key)) routes.set(key, { recorrido: card.recorrido, par_total: holes.reduce((sum, hole) => sum + hole.par, 0), hoyos: holes });
  }
  return [...routes.values()];
};

test('national review catalog covers the official directory without duplicate codes', () => {
  assert.equal(catalog.campos.length, 435);
  assert.equal(new Set(catalog.campos.map(club => club.codigo)).size, catalog.campos.length);
  assert.equal(catalog.campos.filter(club => club.comunidad_autonoma === 'Comunitat Valenciana').length, 35);
  assert.equal(catalog.campos.filter(club => club.provincia === 'Sin identificar').length, 0);
  const routes = catalog.campos.flatMap(club => club.recorridos);
  assert.equal(routes.length, 895);
  assert.equal(routes.reduce((count, route) => count + route.hoyos.length, 0), 16110);
});

test('national catalog preserves all distinct Valencian routes', () => {
  const nationalByCode = new Map(catalog.campos.map(club => [club.codigo, club]));
  for (const original of valencianCatalog.campos) {
    const national = nationalByCode.get(original.codigo);
    assert.ok(national, original.codigo);
    assert.deepEqual(national.recorridos.map(({ variante: _variante, ...route }) => route), compact(original.tarjetas), original.codigo);
  }
});

test('review routes retain only complete holes, pars and difficulty indexes', () => {
  for (const club of catalog.campos) {
    for (const source of [club.fuente_directorio, club.fuente_tarjetas].filter(Boolean)) {
      const url = new URL(source);
      assert.equal(url.protocol, 'https:');
      assert.ok(['golfcv.com', 'rfegolf.es'].includes(url.hostname));
    }
    assert.equal('tarjetas' in club, false);
    for (const route of club.recorridos) {
      const context = `${club.codigo}: ${route.recorrido}`;
      assert.deepEqual(route.hoyos.map(hole => hole.hoyo), Array.from({ length: route.hoyos.length }, (_, index) => index + 1), context);
      assert.equal(route.hoyos.reduce((sum, hole) => sum + hole.par, 0), route.par_total, context);
      assert.deepEqual(Object.keys(route).sort(), route.variante ? ['hoyos', 'par_total', 'recorrido', 'variante'] : ['hoyos', 'par_total', 'recorrido']);
      for (const hole of route.hoyos) {
        assert.deepEqual(Object.keys(hole).sort(), ['dificultad', 'hoyo', 'par']);
        assert.ok(Number.isInteger(hole.par) && hole.par >= 3 && hole.par <= 6, context);
        assert.ok(Number.isInteger(hole.dificultad) && hole.dificultad >= 1 && hole.dificultad <= 18, context);
      }
    }
  }
});
