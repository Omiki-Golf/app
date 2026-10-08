import { useEffect, useMemo, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import type { GolfCourse } from '../types';
import catalogUrl from '../data/recorridos-golf-espana.json?url';

interface CatalogRoute { recorrido: string; variante?: number; hoyos: unknown[] }
interface CatalogClub { codigo: string; campo: string; comunidad_autonoma: string; provincia: string; recorridos: CatalogRoute[] }
interface Catalog { campos: CatalogClub[] }
interface Result { key: string; label: string; club: CatalogClub; route: CatalogRoute; routeIndex: number }

const inputClass = 'w-full px-4 py-3 bg-card border-2 border-line-2 rounded-lg focus:outline-none focus:border-accent';
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

export function CourseCatalogPicker({ courses, selectedCourseId, onSelect, onUnavailable }: {
  courses: GolfCourse[];
  selectedCourseId: string | null;
  onSelect: (courseId: string) => void;
  onUnavailable: () => void;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [region, setRegion] = useState('');
  const [province, setProvince] = useState('');
  const [clubCode, setClubCode] = useState('');
  const [routeIndex, setRouteIndex] = useState('');
  const courseByKey = useMemo(() => new Map(courses.filter(course => course.catalog_key).map(course => [course.catalog_key, course])), [courses]);
  const selected = courses.find(course => course.id === selectedCourseId);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(catalogUrl, { signal: controller.signal }).then(response => response.json()).then(setCatalog).catch(error => {
      if (error.name !== 'AbortError') console.error('No se pudo cargar el catálogo de campos:', error);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!focused && selected) setQuery(selected.catalog_field ? `${selected.catalog_field} — ${selected.catalog_route}` : selected.name);
  }, [focused, selected]);

  const allResults = useMemo(() => catalog?.campos.flatMap(club => club.recorridos.map((route, index) => ({
    key: `${club.codigo}:${index}`,
    label: `${club.campo} — ${route.recorrido}${route.variante ? ` (variante ${route.variante})` : ''}`,
    club, route, routeIndex: index,
  }))) ?? [], [catalog]);
  const normalizedQuery = normalize(query.trim());
  const results = normalizedQuery.length >= 2 ? allResults.filter(result => normalize(`${result.label} ${result.club.provincia} ${result.club.comunidad_autonoma}`).includes(normalizedQuery)).slice(0, 12) : [];
  const legacyResults = normalizedQuery.length >= 2 ? courses.filter(course => !course.catalog_key && normalize(course.name).includes(normalizedQuery)).slice(0, 5) : [];
  const regions = [...new Set((catalog?.campos ?? []).map(club => club.comunidad_autonoma))].sort((a, b) => a.localeCompare(b, 'es'));
  const provinces = [...new Set((catalog?.campos ?? []).filter(club => !region || club.comunidad_autonoma === region).map(club => club.provincia))].sort((a, b) => a.localeCompare(b, 'es'));
  const clubs = (catalog?.campos ?? []).filter(club => (!region || club.comunidad_autonoma === region) && (!province || club.provincia === province));
  const club = clubs.find(item => item.codigo === clubCode);

  const choose = (result: Result) => {
    const databaseCourse = courseByKey.get(result.key);
    if (!databaseCourse) { setFocused(false); setAdvanced(false); onUnavailable(); return; }
    onSelect(databaseCourse.id);
    setQuery(result.label);
    setFocused(false);
    setAdvanced(false);
  };

  return <>
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={19} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            value={query}
            onFocus={() => setFocused(true)}
            onChange={event => setQuery(event.target.value)}
            onBlur={() => window.setTimeout(() => setFocused(false), 150)}
            placeholder="Buscar campo o recorrido"
            className={`${inputClass} pl-10`}
            aria-label="Buscar campo o recorrido"
          />
        </div>
        <button type="button" onClick={() => setAdvanced(true)} className="shrink-0 border-2 border-line-2 rounded-lg px-3 text-accent-ink" title="Búsqueda avanzada" aria-label="Búsqueda avanzada">
          <SlidersHorizontal size={22} />
        </button>
      </div>
      {focused && normalizedQuery.length >= 2 && <div className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto bg-card border border-line rounded-xl shadow-xl">
        {legacyResults.map(course => <button type="button" key={course.id} onMouseDown={() => { onSelect(course.id); setQuery(course.name); setFocused(false); }} className="block w-full text-left px-4 py-3 border-b border-line hover:bg-card-2">
          <span className="block font-semibold">{course.name}</span><span className="block text-sm text-ink-3">Campo disponible actualmente</span>
        </button>)}
        {results.length ? results.map(result => <button type="button" key={result.key} onMouseDown={() => choose(result)} className="block w-full text-left px-4 py-3 border-b border-line last:border-0 hover:bg-card-2">
          <span className="block font-semibold">{result.club.campo}</span>
          <span className="block text-sm text-ink-3">{result.route.recorrido}{result.route.variante ? ` · variante ${result.route.variante}` : ''} · {result.club.provincia}</span>
        </button>) : !legacyResults.length && <p className="p-4 text-sm text-ink-3">No se han encontrado campos.</p>}
      </div>}
    </div>

    {advanced && <div className="fixed inset-0 z-50 bg-black/60 p-4 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="advanced-course-title">
      <div className="bg-card border border-line rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between"><h2 id="advanced-course-title" className="text-xl font-bold">Búsqueda avanzada</h2><button type="button" onClick={() => setAdvanced(false)} className="p-2" aria-label="Cerrar"><X /></button></div>
        <label className="block text-sm font-semibold">Comunidad autónoma<select className={`${inputClass} mt-2`} value={region} onChange={event => { setRegion(event.target.value); setProvince(''); setClubCode(''); setRouteIndex(''); }}><option value="">Todas</option>{regions.map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="block text-sm font-semibold">Provincia<select className={`${inputClass} mt-2`} value={province} onChange={event => { setProvince(event.target.value); setClubCode(''); setRouteIndex(''); }}><option value="">Todas</option>{provinces.map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="block text-sm font-semibold">Campo<select className={`${inputClass} mt-2`} value={clubCode} onChange={event => { setClubCode(event.target.value); setRouteIndex(''); }}><option value="">Selecciona un campo</option>{clubs.map(item => <option key={item.codigo} value={item.codigo}>{item.campo}</option>)}</select></label>
        <label className="block text-sm font-semibold">Recorrido<select disabled={!club} className={`${inputClass} mt-2 disabled:opacity-50`} value={routeIndex} onChange={event => setRouteIndex(event.target.value)}><option value="">Selecciona un recorrido</option>{club?.recorridos.map((route, index) => <option key={index} value={index}>{route.recorrido}{route.variante ? ` · variante ${route.variante}` : ''}</option>)}</select></label>
        <button type="button" disabled={!club || routeIndex === ''} onClick={() => club && choose({ key: `${club.codigo}:${routeIndex}`, label: '', club, route: club.recorridos[Number(routeIndex)], routeIndex: Number(routeIndex) })} className="w-full bg-accent text-on-accent rounded-xl py-3 font-bold disabled:opacity-50">Seleccionar recorrido</button>
      </div>
    </div>}
  </>;
}
