import { useMemo, useState } from 'react';
import { ArrowLeft, LoaderCircle, Mic, MicOff, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { GameMode, GolfCourse } from '../../types';
import { CourseCatalogPicker } from '../../components/CourseCatalogPicker';
import { interpretRoundVoiceLocally, type VoiceRoundDraft } from './localAiClient';

export interface AiRoundSetupValue { courseId: string; gameMode: GameMode; holes: 9 | 18; holesRange?: '1-9' | '10-18'; players: Array<{ name: string; handicap: number }> }
interface DraftPlayer { name: string; handicap: string }
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
const limits: Record<GameMode, { min: number; max: number }> = { stableford: { min: 1, max: 4 }, match: { min: 2, max: 2 }, sindicato: { min: 3, max: 3 }, parejas: { min: 4, max: 4 } };
const similarity = (course: GolfCourse, draft: VoiceRoundDraft) => {
  const wanted = normalize(`${draft.campo} ${draft.recorrido}`.trim());
  const candidate = normalize(`${course.catalog_field ?? ''} ${course.catalog_route ?? ''} ${course.name}`);
  return wanted.split(/\s+/).filter(Boolean).reduce((score, word) => score + (candidate.includes(word) ? word.length : 0), 0);
};
const matchCourse = (courses: GolfCourse[], draft: VoiceRoundDraft) => {
  if (!draft.campo) return undefined;
  const ranked = courses.map(course => ({ course, score: similarity(course, draft) })).sort((a, b) => b.score - a.score);
  if (!ranked[0] || ranked[0].score < 4) return undefined;
  const routeSpecified = Boolean(draft.recorrido && !['vacio', 'vacío', 'ninguno'].includes(normalize(draft.recorrido)));
  const sameField = courses.filter(course => normalize(course.catalog_field ?? '') === normalize(ranked[0].course.catalog_field ?? ''));
  return !routeSpecified && sameField.length > 1 ? undefined : ranked[0].course;
};

export default function LocalVoiceRoundSetup({ courses, isExpress, onCancel, onCreate }: { courses: GolfCourse[]; isExpress: boolean; onCancel: () => void; onCreate: (value: AiRoundSetupValue) => Promise<void> }) {
  const [listening, setListening] = useState(false), [loading, setLoading] = useState(false), [creating, setCreating] = useState(false);
  const [transcript, setTranscript] = useState(''), [draft, setDraft] = useState<VoiceRoundDraft | null>(null), [error, setError] = useState('');
  const [courseId, setCourseId] = useState<string | null>(null), [gameMode, setGameMode] = useState<GameMode | ''>(isExpress ? 'stableford' : '');
  const [holes, setHoles] = useState<9 | 18 | 0>(0), [holesRange, setHolesRange] = useState<'1-9' | '10-18'>('1-9');
  const [players, setPlayers] = useState<DraftPlayer[]>([]);
  const matchedCourse = useMemo(() => draft ? matchCourse(courses, draft) : undefined, [courses, draft]);

  const interpret = async (text: string) => {
    setLoading(true); setError('');
    try {
      const result = await interpretRoundVoiceLocally(text);
      setDraft(result);
      if (isExpress) setGameMode('stableford'); else if (result.modalidad) setGameMode(result.modalidad);
      if (result.hoyos) setHoles(result.hoyos);
      const course = matchCourse(courses, result); if (course) setCourseId(course.id);
      setPlayers(result.jugadores.map(name => ({ name, handicap: '' })));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo interpretar la orden.'); }
    finally { setLoading(false); }
  };
  const listen = async () => {
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) { setError('Este navegador no ofrece reconocimiento de voz. Escribe la orden.'); return; }
    try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.getTracks().forEach(track => track.stop()); }
    catch { setError('Micrófono bloqueado. Permítelo para localhost:5174 o escribe la orden.'); return; }
    let local = false;
    if (typeof Recognition.available === 'function') try {
      const availability = await Recognition.available({ langs: ['es-ES'], processLocally: true });
      if (availability === 'available') local = true;
      else if ((availability === 'downloadable' || availability === 'downloading') && typeof Recognition.install === 'function') { setListening(true); setError('Preparando el reconocimiento de voz en español en este dispositivo…'); local = await Recognition.install({ langs: ['es-ES'], processLocally: true }); setListening(false); }
    } catch { /* Fall back to the browser recognition service. */ }
    const recognition = new Recognition(); recognition.lang = 'es-ES'; recognition.interimResults = false; recognition.maxAlternatives = 1;
    if ('processLocally' in recognition) recognition.processLocally = local;
    recognition.onstart = () => { setListening(true); setError(''); }; recognition.onend = () => setListening(false);
    recognition.onerror = (event: any) => setError(event.error === 'network' ? 'El servicio de voz no tiene conexión. Puedes escribir la orden.' : event.error === 'no-speech' ? 'No se ha detectado voz.' : `No se pudo escuchar (${event.error}).`);
    recognition.onresult = (event: any) => { const text = event.results[0][0].transcript; setTranscript(text); void interpret(text); }; recognition.start();
  };
  const modeLimits = gameMode ? limits[gameMode] : null, handicapMax = holes === 18 ? 54 : 27;
  const validPlayers = Boolean(modeLimits && players.length >= modeLimits.min && players.length <= modeLimits.max && players.every(player => player.name.trim() && Number.isFinite(Number(player.handicap)) && Number(player.handicap) >= 0 && Number(player.handicap) <= handicapMax));
  const canCreate = Boolean(courseId && gameMode && holes && validPlayers);
  const submit = async () => {
    if (!canCreate || !courseId || !gameMode || !holes) return;
    setCreating(true); setError('');
    try { await onCreate({ courseId, gameMode, holes, holesRange: holes === 9 ? holesRange : undefined, players: players.map(player => ({ name: player.name.trim(), handicap: Number(player.handicap) })) }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo crear la partida.'); setCreating(false); }
  };
  return <div className="min-h-screen bg-app p-4 md:p-8"><div className="mx-auto max-w-2xl">
    <button type="button" onClick={onCancel} className="mb-4 flex items-center gap-2 font-semibold text-accent-ink"><ArrowLeft size={20} /> Atrás</button>
    <section className="rounded-xl bg-card p-5 shadow-card md:p-8"><h1 className="text-center text-3xl font-bold text-title">Crear partida con IA</h1><p className="mt-2 text-center text-sm text-ink-3">Cuéntame la partida y revisa todos los datos antes de crearla.</p>
      <div className="mt-6 flex gap-2"><input value={transcript} onChange={event => setTranscript(event.target.value)} placeholder="9 hoyos en Panorámica con Fede y Pablo" className="min-w-0 flex-1 rounded-lg border-2 border-line-2 bg-card px-3 py-3" /><button type="button" onClick={listen} disabled={listening || loading} className="rounded-full bg-violet-600 p-3 text-white disabled:opacity-60" aria-label="Dictar partida">{listening ? <MicOff /> : <Mic />}</button><button type="button" onClick={() => void interpret(transcript)} disabled={!transcript.trim() || loading} className="rounded-lg bg-violet-600 px-4 text-white disabled:opacity-50">{loading ? <LoaderCircle className="animate-spin" /> : <Sparkles />}</button></div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}
      <div className="mt-6 space-y-5">
        <div><label className="mb-2 block font-semibold text-ink-2">Campo y recorrido</label><CourseCatalogPicker courses={courses} selectedCourseId={courseId} onSelect={setCourseId} onUnavailable={() => setError('Este recorrido todavía no está incorporado a la base de datos.')} />{draft?.campo && !matchedCourse && !courseId && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">He entendido “{draft.campo}”, pero necesito que selecciones el recorrido.</p>}</div>
        <div><p className="mb-2 font-semibold text-ink-2">Hoyos</p><div className="grid grid-cols-2 gap-2">{([9, 18] as const).map(value => <button type="button" key={value} onClick={() => setHoles(value)} className={`rounded-lg border-2 py-3 font-bold ${holes === value ? 'border-violet-600 bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-100' : 'border-line-2'}`}>{value} hoyos</button>)}</div>{holes === 9 && <div className="mt-2 grid grid-cols-2 gap-2">{(['1-9', '10-18'] as const).map(value => <button type="button" key={value} onClick={() => setHolesRange(value)} className={`rounded-lg border px-3 py-2 ${holesRange === value ? 'border-violet-600 font-bold text-violet-700 dark:text-violet-200' : 'border-line'}`}>Hoyos {value}</button>)}</div>}</div>
        <div><p className="mb-2 font-semibold text-ink-2">Modalidad</p>{isExpress ? <p className="rounded-lg bg-violet-50 p-3 font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-100">Stableford · incluida en Express</p> : <div className="grid grid-cols-2 gap-2">{(['stableford', 'match', 'sindicato', 'parejas'] as GameMode[]).map(mode => <button type="button" key={mode} onClick={() => { setGameMode(mode); setPlayers(current => current.slice(0, limits[mode].max)); }} className={`rounded-lg border-2 py-2 capitalize ${gameMode === mode ? 'border-violet-600' : 'border-line-2'}`}>{mode}</button>)}</div>}</div>
        <div><div className="flex items-center justify-between"><div><p className="font-semibold text-ink-2">Jugadores</p><p className="text-xs text-ink-3">{modeLimits ? gameMode === 'stableford' ? 'Entre 1 y 4 jugadores' : `${modeLimits.min} jugadores obligatorios` : 'Selecciona la modalidad'}</p></div><button type="button" disabled={!modeLimits || players.length >= (modeLimits?.max ?? 0)} onClick={() => setPlayers(current => [...current, { name: '', handicap: '' }])} className="flex items-center gap-1 rounded-lg border border-violet-300 px-3 py-2 text-sm font-semibold text-violet-700 disabled:opacity-40"><Plus size={16} /> Añadir</button></div>
          <div className="mt-2 space-y-2">{players.map((player, index) => <div key={index} className="grid grid-cols-[1fr_7rem_2.5rem] gap-2"><input aria-label={`Nombre del jugador ${index + 1}`} value={player.name} onChange={event => setPlayers(current => current.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} placeholder={`Jugador ${index + 1}`} className="min-w-0 rounded-lg border border-line-2 bg-card px-3 py-2" /><input aria-label={`Hándicap del jugador ${index + 1}`} type="number" min="0" max={handicapMax} step="0.1" value={player.handicap} onChange={event => setPlayers(current => current.map((item, i) => i === index ? { ...item, handicap: event.target.value } : item))} placeholder="Hándicap" className="min-w-0 rounded-lg border border-line-2 bg-card px-2 py-2" /><button type="button" onClick={() => setPlayers(current => current.filter((_, i) => i !== index))} className="rounded-lg text-red-600" aria-label={`Eliminar jugador ${index + 1}`}><Trash2 className="mx-auto" size={19} /></button></div>)}</div>
          {modeLimits && players.length < modeLimits.min && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Faltan {modeLimits.min - players.length} jugador{modeLimits.min - players.length === 1 ? '' : 'es'}.</p>}
        </div>
      </div>
      <button type="button" onClick={() => void submit()} disabled={!canCreate || creating} className="mt-7 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 py-4 font-bold text-white disabled:opacity-50">{creating && <LoaderCircle className="animate-spin" size={20} />}{creating ? 'Creando partida…' : 'Crear partida y empezar'}</button>{!canCreate && <p className="mt-2 text-center text-xs text-ink-3">Completa campo, recorrido, hoyos y hándicap de todos los jugadores.</p>}
    </section>
  </div></div>;
}
