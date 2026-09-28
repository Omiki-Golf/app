import { useEffect, useState } from 'react';
import { golfService } from '../../services/golfService';
import type { GolfCourse, GolfHole, Tee } from '../../types';
import { lazy, Suspense } from 'react';

const AdminCourseCatalog = lazy(() => import('./AdminCourseCatalog'));

const message = (error: unknown) => error && typeof error === 'object' && 'message' in error
  ? String(error.message) : 'No se han podido cargar los campos.';

export function AdminCourses() {
  const [view, setView] = useState<'catalog' | 'registered'>('catalog');
  return <section aria-label="Campos de golf" className="space-y-4">
    <h2 className="text-xl font-bold">Campos de golf</h2>
    <div className="flex flex-wrap gap-2">
      <button onClick={() => setView('catalog')} aria-pressed={view === 'catalog'} className={`border border-line rounded-xl p-3 ${view === 'catalog' ? 'bg-accent text-on-accent' : 'bg-card'}`}>Catálogo para revisar</button>
      <button onClick={() => setView('registered')} aria-pressed={view === 'registered'} className={`border border-line rounded-xl p-3 ${view === 'registered' ? 'bg-accent text-on-accent' : 'bg-card'}`}>Campos en la aplicación</button>
    </div>
    {view === 'catalog' ? <Suspense fallback={<p role="status">Cargando catálogo…</p>}><AdminCourseCatalog /></Suspense> : <RegisteredCourses />}
  </section>;
}

function RegisteredCourses() {
  const [courses, setCourses] = useState<GolfCourse[]>([]);
  const [selected, setSelected] = useState('');
  const [search, setSearch] = useState('');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<{ holes: GolfHole[]; tees: Tee[] } | null>(null);
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    setSelected('');
    golfService.getCourses().then(rows => {
      if (live) setCourses([...rows].sort((a, b) => a.name.localeCompare(b.name, 'es')));
    }).catch(cause => {
      if (live) { setCourses([]); setError(message(cause)); }
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [revision]);

  useEffect(() => {
    let live = true;
    setDetail(null);
    setDetailError('');
    if (selected) {
      Promise.all([golfService.getRegisteredCourseHoles(selected), golfService.getTees(selected)])
        .then(([holes, tees]) => { if (live) setDetail({ holes, tees }); })
        .catch(cause => { if (live) setDetailError(message(cause)); });
    }
    return () => { live = false; };
  }, [selected]);

  const course = courses.find(item => item.id === selected);
  const filtered = courses.filter(item => item.name.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')));
  return (
    <section aria-label="Campos de golf" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-bold">Campos de golf</h2><p className="text-sm text-ink-3">Consulta los datos registrados para revisarlos.</p></div>
        <button disabled={loading} onClick={() => setRevision(value => value + 1)} className="border border-line rounded-xl p-3 disabled:opacity-50">Actualizar campos</button>
      </div>
      <label className="block">Buscar campo
        <input value={search} onChange={event => setSearch(event.target.value)} className="mt-1 w-full bg-card border border-line rounded-xl p-3" type="search" />
      </label>
      {error && <p role="alert" className="text-red-600">{error}</p>}
      {loading ? <p role="status">Cargando campos…</p> : !error && (
        <div className="flex flex-wrap gap-2">
          {filtered.map(item => <button key={item.id} onClick={() => { if (selected !== item.id) { setDetail(null); setDetailError(''); setSelected(item.id); } }} aria-pressed={selected === item.id} className={`rounded-xl border border-line p-3 ${selected === item.id ? 'bg-accent text-on-accent' : 'bg-card'}`}>{item.name}</button>)}
          {!filtered.length && <p className="text-ink-3">{courses.length ? 'No hay campos que coincidan con la búsqueda.' : 'No hay campos registrados.'}</p>}
        </div>
      )}
      {!loading && course && <article className="bg-card border border-line rounded-2xl p-4 space-y-4">
        <h3 className="text-lg font-semibold">{course.name}</h3>
        {course.description && <p className="text-ink-3">{course.description}</p>}
        {detailError ? <p role="alert" className="text-red-600">{detailError}</p> : !detail ? <p role="status">Cargando datos del campo…</p> : <>
          <h4 className="font-semibold">Hoyos ({detail.holes.length})</h4>
          {detail.holes.length ? <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="p-2">Hoyo</th><th className="p-2">Par</th><th className="p-2">Índice de hándicap</th></tr></thead><tbody>{detail.holes.map(hole => <tr key={hole.id} className="border-t border-line"><td className="p-2">{hole.hole_number}</td><td className="p-2">{hole.par}</td><td className="p-2">{hole.stroke_index}</td></tr>)}</tbody></table></div> : <p>No hay hoyos registrados.</p>}
          <h4 className="font-semibold">Salidas y slope</h4>
          {detail.tees.length ? <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="p-2">Salida</th><th className="p-2">Color</th><th className="p-2">18 hoyos</th><th className="p-2">1–9</th><th className="p-2">10–18</th></tr></thead><tbody>{detail.tees.map(tee => <tr key={tee.id} className="border-t border-line"><td className="p-2">{tee.name}</td><td className="p-2">{tee.color}</td><td className="p-2">{tee.slope_18 ?? '—'}</td><td className="p-2">{tee.slope_9_i ?? '—'}</td><td className="p-2">{tee.slope_9_ii ?? '—'}</td></tr>)}</tbody></table></div> : <p>No hay salidas registradas.</p>}
        </>}
      </article>}
    </section>
  );
}
