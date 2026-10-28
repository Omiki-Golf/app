import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const original = JSON.parse(await readFile(new URL('../src/data/recorridos-golf-espana.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('../src/components/CourseCatalogPicker.tsx', import.meta.url), 'utf8');
// Exercise the component's real derivations with memo slots preserved across renders.
const body = source.slice(0, source.indexOf('  const choose ='))
  .replace(/^import .*;\r?\n/gm, '')
  .replace('export function CourseCatalogPicker', 'function CourseCatalogPicker')
  .replace('const normalize =', 'const normalizeImpl =')
  .replace('export function', 'function');
const instrumented = body.replace('function CourseCatalogPicker', 'const normalize = (value: string) => { globalThis.normalizations++; return normalizeImpl(value); };\nfunction CourseCatalogPicker');
const script = ts.transpileModule(instrumented + '\nreturn { results, legacyResults, regions, provinces, clubs }; }\nglobalThis.renderPicker = CourseCatalogPicker;', {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

function harness() {
  let state;
  let stateSlot;
  let memoSlot;
  const memo = [];
  const context = vm.createContext({
    normalizations: 0,
    useEffect() {},
    useState(initial) { const index = stateSlot++; return [state[index] ?? initial, () => {}]; },
    useMemo(fn, deps) {
      const index = memoSlot++;
      if (!memo[index] || deps.some((value, i) => !Object.is(value, memo[index].deps[i]))) memo[index] = { deps, value: fn() };
      return memo[index].value;
    },
  });
  vm.runInContext(script, context);
  return {
    render(catalog, courses, query, region = '', province = '', focused = false) {
      state = [catalog, query, focused, false, region, province, '', ''];
      stateSlot = 0; memoSlot = 0;
      return context.renderPicker({ courses, selectedCourseId: null });
    },
    count: () => context.normalizations,
  };
}

const courses = [{ id: 'legacy', name: 'Campo Antiguo Águila' }, { id: 'linked', name: 'Linked', catalog_key: 'some:0' }];
test('indexed search preserves the previous results, order, limits, accents and variants', () => {
  const h = harness();
  for (const query of ['', 'a', 'golf', 'Águil', '  COSTA  ', 'valenciana', 'variante 2', 'campo antiguo', 'zzz-no-results']) {
    const term = normalize(query.trim());
    const expected = term.length < 2 ? [] : original.campos.flatMap(club => club.recorridos.map((route, i) => ({
      key: `${club.codigo}:${i}`,
      text: `${club.campo} — ${route.recorrido}${route.variante ? ` (variante ${route.variante})` : ''} ${club.provincia} ${club.comunidad_autonoma}`,
    }))).filter(item => normalize(item.text).includes(term)).slice(0, 12).map(item => item.key);
    const actual = h.render(original, courses, query);
    assert.deepEqual(Array.from(actual.results, item => item.key), expected, query);
    const legacy = term.length < 2 ? [] : courses.filter(c => !c.catalog_key && normalize(c.name).includes(term)).slice(0, 5).map(c => c.id);
    assert.deepEqual(Array.from(actual.legacyResults, item => item.id), legacy);
  }
});

test('unchanged renders reuse search and filters; typing only normalizes the new query', () => {
  const h = harness();
  const first = h.render(original, courses, 'golf');
  const count = h.count();
  const second = h.render(original, courses, 'golf', '', '', true);
  assert.equal(h.count(), count);
  for (const key of ['results', 'legacyResults', 'regions', 'provinces', 'clubs']) assert.equal(second[key], first[key]);
  h.render(original, courses, 'costa');
  assert.equal(h.count(), count + 1);
});

test('region, province, catalog and course updates invalidate the appropriate cached values', () => {
  const h = harness();
  const province = original.campos.find(c => c.comunidad_autonoma === 'Comunitat Valenciana').provincia;
  const selected = h.render(original, courses, 'golf', 'Comunitat Valenciana', province);
  assert.ok(selected.clubs.length > 0);
  assert.deepEqual(Array.from(selected.clubs, club => club.codigo), original.campos.filter(c => c.comunidad_autonoma === 'Comunitat Valenciana' && c.provincia === province).map(c => c.codigo));
  assert.deepEqual(Array.from(selected.provinces), [...new Set(original.campos.filter(c => c.comunidad_autonoma === 'Comunitat Valenciana').map(c => c.provincia))].sort((a, b) => a.localeCompare(b, 'es')));
  const updated = h.render({ campos: [] }, [{ id: 'new', name: 'Nuevo Golf' }], 'golf');
  assert.equal(updated.results.length, 0);
  assert.equal(updated.regions.length, 0);
  assert.deepEqual(Array.from(updated.legacyResults, item => item.id), ['new']);
});
