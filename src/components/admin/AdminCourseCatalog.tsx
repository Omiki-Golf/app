import { useEffect, useState } from 'react';
import catalogUrl from '../../data/recorridos-golf-espana.json?url';

interface CatalogRoute {
  recorrido: string;
  variante?: number;
  par_total: number;
  hoyos: { hoyo: number; par: number; dificultad: number }[];
}
interface CatalogClub {
  codigo: string;
  campo: string;
  comunidad_autonoma: string;
  provincia: string;
  fuente_directorio: string;
  fuente_tarjetas: string | null;
  estado: string;
  recorridos: CatalogRoute[];
}
interface Catalog {
  titulo: string;
  fecha_consulta: string;
  notas: string[];
  campos: CatalogClub[];
  incidencias_validacion: unknown[];
}
const inputClass = 'mt-1 w-full bg-card border border-line rounded-xl p-3';
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
const number = (value: number) => value.toLocaleString('es-ES');

export default function AdminCourseCatalog() {
  const [data, setData] = useState<Catalog | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('');
  const [province, setProvince] = useState('');
  const [code, setCode] = useState('');
  const [routeIndex, setRouteIndex] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    void (async () => {
      try {
        const response = await fetch(catalogUrl, { signal: controller.signal });
        if (!response.ok) throw new Error('No se ha podido descargar el catálogo.');
        const catalog: Catalog = await response.json();
        if (!Array.isArray(catalog.campos)) throw new Error('El catálogo no tiene el formato esperado.');
        if (!controller.signal.aborted) setData(catalog);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se ha podido cargar el catálogo.');
      }
    })();
    return () => controller.abort();
  }, [attempt]);

  if (error) return <div role="alert" className="space-y-3"><p>{error}</p><button onClick={() => setAttempt(value => value + 1)} className="border border-line rounded-xl p-3">Reintentar</button></div>;
  if (!data) return <p role="status">Cargando catálogo…</p>;

  const availableProvinces = data.campos.filter(club => !region || club.comunidad_autonoma === region).map(club => club.provincia);
  const filtered = data.campos.filter(club => (!region || club.comunidad_autonoma === region) && (!province || club.provincia === province) && normalize(`${club.campo} ${club.codigo}`).includes(normalize(search.trim())));
  const club = filtered.find(item => item.codigo === code) ?? filtered[0];
  const route = club?.recorridos[routeIndex] ?? club?.recorridos[0];
  const routes = data.campos.flatMap(item => item.recorridos);
  const resetSelection = () => { setCode(''); setRouteIndex(0); };
  const groupedClubs = [...new Set(filtered.map(item => item.comunidad_autonoma))].sort((a, b) => a.localeCompare(b, 'es'));

  return <div className="space-y-4">
    <div className="bg-card border border-line rounded-2xl p-4 space-y-2">
      <h3 className="text-lg font-semibold">{data.titulo}</h3>
      <p>{data.campos.length} campos · {routes.length} recorridos · {number(routes.reduce((sum, item) => sum + item.hoyos.length, 0))} registros de hoyos</p>
      <p className="text-sm text-ink-3">Consulta del {data.fecha_consulta.split('-').reverse().join('/')} · Datos aportados para revisión. Este catálogo no cambia los campos disponibles al crear partidas.</p>
      <a href={catalogUrl} download="recorridos-golf-espana.json" className="inline-block text-accent-ink underline py-2">Descargar todos los datos en JSON</a>
    </div>
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <label>Buscar campo o código<input type="search" value={search} onChange={event => { setSearch(event.target.value); resetSelection(); }} className={inputClass} /></label>
      <label>Comunidad autónoma<select value={region} onChange={event => { setRegion(event.target.value); setProvince(''); resetSelection(); }} className={inputClass}><option value="">Todas las comunidades</option>{[...new Set(data.campos.map(item => item.comunidad_autonoma))].sort((a, b) => a.localeCompare(b, 'es')).map(item => <option key={item}>{item}</option>)}</select></label>
      <label>Provincia<select value={province} onChange={event => { setProvince(event.target.value); resetSelection(); }} className={inputClass}><option value="">Todas las provincias</option>{[...new Set(availableProvinces)].sort((a, b) => a.localeCompare(b, 'es')).map(item => <option key={item}>{item}</option>)}</select></label>
      <label>Campo<select disabled={!club} value={club?.codigo ?? ''} onChange={event => { setCode(event.target.value); setRouteIndex(0); }} className={inputClass}>{!club && <option value="">Sin resultados</option>}{groupedClubs.map(group => <optgroup key={group} label={group}>{filtered.filter(item => item.comunidad_autonoma === group).map(item => <option key={item.codigo} value={item.codigo}>{item.campo} ({item.provincia}){item.recorridos.length ? '' : ' — sin recorrido'}</option>)}</optgroup>)}</select></label>
      <label>Recorrido<select disabled={!route} value={route ? club.recorridos.indexOf(route) : ''} onChange={event => setRouteIndex(Number(event.target.value))} className={inputClass}>{!route && <option value="">Sin recorrido</option>}{club?.recorridos.map((item, index) => <option key={index} value={index}>{item.recorrido}{item.variante ? ` · variante ${item.variante}` : ''}</option>)}</select></label>
    </div>
    {!club ? <p role="status">No hay campos que coincidan con la búsqueda.</p> : <article className="bg-card border border-line rounded-2xl p-4 space-y-4">
      <div><h3 className="text-xl font-semibold">{club.campo}</h3><p className="text-ink-3">{club.codigo} · {club.comunidad_autonoma} · {club.provincia} · {club.estado}</p></div>
      {route ? <>
        <p>{route.recorrido}{route.variante ? ` · variante ${route.variante}` : ''}</p>
        <p>{route.hoyos.length} hoyos · Par {route.par_total}</p>
        <div className="overflow-x-auto"><table className="w-full text-left">
          <caption className="sr-only">Recorrido de {club.campo}: {route.recorrido}</caption>
          <thead><tr>{['Hoyo', 'Par', 'Dificultad'].map(label => <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead>
          <tbody>{route.hoyos.map(hole => <tr key={hole.hoyo} className="border-t border-line"><th scope="row" className="p-2 font-normal">{hole.hoyo}</th><td className="p-2">{hole.par}</td><td className="p-2">{hole.dificultad}</td></tr>)}</tbody>
          <tfoot><tr className="border-t border-line font-semibold"><th scope="row" className="p-2">Total</th><td className="p-2">{route.par_total}</td><td /></tr></tfoot>
        </table></div>
      </> : <p>No hay datos hoyo a hoyo en el archivo aportado para este campo.</p>}
      <div className="flex flex-wrap gap-4 text-accent-ink underline">
        {club.fuente_tarjetas && <a href={club.fuente_tarjetas} target="_blank" rel="noopener noreferrer">Ficha original de la RFEG</a>}
        <a href={club.fuente_directorio} target="_blank" rel="noopener noreferrer">Directorio de origen</a>
      </div>
    </article>}
    <details className="bg-card border border-line rounded-2xl p-4"><summary className="cursor-pointer font-semibold">Alcance y notas del archivo</summary><ul className="list-disc pl-5 mt-3 space-y-2">{data.notas.map(note => <li key={note}>{note}</li>)}</ul><p className="mt-3">Sin recorrido: {data.campos.filter(item => !item.recorridos.length).map(item => item.campo).join(', ') || 'Ninguno'}.</p></details>
  </div>;
}
