import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const catalog = JSON.parse(await readFile(new URL('../src/data/recorridos-golf-comunidad-valenciana.json', import.meta.url), 'utf8'));

test('review catalog preserves every record from the supplied HTML and JSON', () => {
  // Digest of the user-supplied JSON, independently matched to the HTML payload.
  assert.equal(createHash('sha256').update(JSON.stringify(catalog)).digest('hex'), '63196cc6d9ba26827857847b538db0d55817041baed0bbef66e3890b2109bb65');
  assert.equal(catalog.campos.length, 35);
  assert.equal(new Set(catalog.campos.map(club => club.codigo)).size, 35);
  const cards = catalog.campos.flatMap(club => club.tarjetas);
  assert.equal(cards.length, 380);
  assert.equal(cards.reduce((count, card) => count + card.hoyos.length, 0), 6840);
  assert.deepEqual(catalog.campos.filter(club => !club.tarjetas.length).map(club => club.campo), ['Cancha de Golf Gandía']);
});

test('review cards retain complete holes, matching totals and safe source links', () => {
  for (const club of catalog.campos) {
    for (const source of [club.fuente_directorio, club.fuente_tarjetas].filter(Boolean)) {
      const url = new URL(source);
      assert.equal(url.protocol, 'https:');
      assert.ok(['golfcv.com', 'rfegolf.es'].includes(url.hostname));
    }
    for (const card of club.tarjetas) {
      const context = `${club.codigo}: ${card.recorrido} / ${card.barras} / ${card.categoria}`;
      assert.deepEqual(card.hoyos.map(hole => hole.hoyo), Array.from({ length: 18 }, (_, index) => index + 1), context);
      assert.equal(card.hoyos.reduce((sum, hole) => sum + hole.par, 0), card.par_total, context);
      assert.equal(card.hoyos.reduce((sum, hole) => sum + hole.metros, 0), card.metros_total, context);
      assert.ok(Number.isFinite(card.valor_campo) && Number.isFinite(card.slope), context);
      for (const hole of card.hoyos) {
        // La Marquesa includes a par-6 ninth hole in eight supplied cards.
        assert.ok(Number.isInteger(hole.par) && hole.par >= 3 && hole.par <= 6, context);
        assert.ok(Number.isInteger(hole.handicap) && hole.handicap >= 1 && hole.handicap <= 18, context);
        assert.ok(Number.isInteger(hole.metros) && hole.metros > 0, context);
      }
    }
  }
});
