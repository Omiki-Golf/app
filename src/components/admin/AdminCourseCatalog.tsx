import { useEffect, useState } from 'react';
import catalogUrl from '../../data/recorridos-golf-comunidad-valenciana.json?url';

interface CatalogCard {
  recorrido: string;
  barras: string;
  categoria: string;
  valor_campo: number;
  slope: number;
  par_total: number;
  metros_total: number;
  hoyos: { hoyo: number; par: number; handicap: number; metros: number }[];
}
interface CatalogClub {
  codigo: string;
  campo: string;
  provincia: string;
  fuente_directorio: string;
  fuente_tarjetas: string | null;
  estado: string;
  tarjetas: CatalogCard[];
}
interface Catalog {
  titulo: string;
  fecha_consulta: string;
  unidad_distancia: string;
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
  const [province, setProvince] = useState('');
  const [code, setCode] = useState('');
  const [cardIndex, setCardIndex] = useState(0);

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

  const filtered = data.campos.filter(club => (!province || club.provincia === province) && normalize(`${club.campo} ${club.codigo}`).includes(normalize(search.trim())));
  const club = filtered.find(item => item.codigo === code) ?? filtered[0];
  const card = club?.tarjetas[cardIndex] ?? club?.tarjetas[0];
  const cards = data.campos.flatMap(item => item.tarjetas);
  const resetSelection = () => { setCode(''); setCardIndex(0); };

  return <div className="space-y-4">
    <div className="bg-card border border-line rounded-2xl p-4 space-y-2">
      <h3 className="text-lg font-semibold">{data.titulo}</h3>
      <p>{data.campos.length} campos · {cards.length} tarjetas · {number(cards.reduce((sum, item) => sum + item.hoyos.length, 0))} registros de hoyos</p>
      <p className="text-sm text-ink-3">Consulta del {data.fecha_consulta.split('-').reverse().join('/')} · Datos aportados para revisión. Este catálogo no cambia los campos disponibles al crear partidas.</p>
      <a href={catalogUrl} download="recorridos-golf-comunidad-valenciana.json" className="inline-block text-accent-ink underline py-2">Descargar todos los datos en JSON</a>
    </div>
    <div className="grid sm:grid-cols-2 gap-4">
      <label>Buscar campo o código<input type="search" value={search} onChange={event => { setSearch(event.target.value); resetSelection(); }} className={inputClass} /></label>
      <label>Provincia<select value={province} onChange={event => { setProvince(event.target.value); resetSelection(); }} className={inputClass}><option value="">Todas las provincias</option>{[...new Set(data.campos.map(item => item.provincia))].sort().map(item => <option key={item}>{item}</option>)}</select></label>
      <label>Campo<select disabled={!club} value={club?.codigo ?? ''} onChange={event => { setCode(event.target.value); setCardIndex(0); }} className={inputClass}>{!club && <option value="">Sin resultados</option>}{filtered.map(item => <option key={item.codigo} value={item.codigo}>{item.campo} ({item.provincia}){item.tarjetas.length ? '' : ' — sin tarjeta'}</option>)}</select></label>
      <label>Recorrido · barras · categoría<select disabled={!card} value={card ? club.tarjetas.indexOf(card) : ''} onChange={event => setCardIndex(Number(event.target.value))} className={inputClass}>{!card && <option value="">Sin tarjeta</option>}{club?.tarjetas.map((item, index) => <option key={index} value={index}>{item.recorrido} · {item.barras} · {item.categoria}</option>)}</select></label>
    </div>
    {!club ? <p role="status">No hay campos que coincidan con la búsqueda.</p> : <article className="bg-card border border-line rounded-2xl p-4 space-y-4">
      <div><h3 className="text-xl font-semibold">{club.campo}</h3><p className="text-ink-3">{club.codigo} · {club.provincia} · {club.estado}</p></div>
      {card ? <>
        <p>{card.recorrido} · {card.barras} · {card.categoria}</p>
        <p>{card.hoyos.length} hoyos · Par {card.par_total} · {number(card.metros_total)} metros · Valor de campo {number(card.valor_campo)} · Slope {card.slope}</p>
        <div className="overflow-x-auto"><table className="w-full text-left">
          <caption className="sr-only">Tarjeta de {club.campo}: {card.recorrido}, {card.barras}, {card.categoria}</caption>
          <thead><tr>{['Hoyo', 'Par', 'Índice de hándicap', 'Metros'].map(label => <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead>
          <tbody>{card.hoyos.map(hole => <tr key={hole.hoyo} className="border-t border-line"><th scope="row" className="p-2 font-normal">{hole.hoyo}</th><td className="p-2">{hole.par}</td><td className="p-2">{hole.handicap}</td><td className="p-2">{number(hole.metros)}</td></tr>)}</tbody>
          <tfoot><tr className="border-t border-line font-semibold"><th scope="row" className="p-2">Total</th><td className="p-2">{card.par_total}</td><td /><td className="p-2">{number(card.metros_total)}</td></tr></tfoot>
        </table></div>
      </> : <p>No hay datos hoyo a hoyo en el archivo aportado para este campo.</p>}
      <div className="flex flex-wrap gap-4 text-accent-ink underline">
        {club.fuente_tarjetas && <a href={club.fuente_tarjetas} target="_blank" rel="noopener noreferrer">Ficha original de la RFEG</a>}
        <a href={club.fuente_directorio} target="_blank" rel="noopener noreferrer">Directorio de la Federación Valenciana</a>
      </div>
    </article>}
    <details className="bg-card border border-line rounded-2xl p-4"><summary className="cursor-pointer font-semibold">Alcance y notas del archivo</summary><ul className="list-disc pl-5 mt-3 space-y-2">{data.notas.map(note => <li key={note}>{note}</li>)}</ul><p className="mt-3">Sin tarjeta: {data.campos.filter(item => !item.tarjetas.length).map(item => item.campo).join(', ') || 'Ninguno'}.</p></details>
  </div>;
}
