import { useMemo, useState } from 'react';
import { LoaderCircle, Mic, MicOff, Sparkles } from 'lucide-react';
import type { GameMode, GolfCourse } from '../../types';
import { interpretRoundVoiceLocally, type VoiceRoundDraft } from './localAiClient';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
const similarity = (course: GolfCourse, draft: VoiceRoundDraft) => {
  const wanted = normalize(`${draft.campo} ${draft.recorrido}`.trim());
  const candidate = normalize(`${course.catalog_field ?? ''} ${course.catalog_route ?? ''} ${course.name}`);
  return wanted.split(/\s+/).filter(Boolean).reduce((score, word) => score + (candidate.includes(word) ? word.length : 0), 0);
};

export default function LocalVoiceRoundSetup({ courses, onApply }: { courses: GolfCourse[]; onApply: (value: { courseId?: string; gameMode?: GameMode; holes?: 9 | 18; players: string[] }) => void }) {
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [draft, setDraft] = useState<VoiceRoundDraft | null>(null);
  const [error, setError] = useState('');
  const matchedCourse = useMemo(() => {
    if (!draft) return undefined;
    const ranked = [...courses].map(course => ({ course, score: similarity(course, draft) })).sort((a, b) => b.score - a.score);
    if (!ranked[0] || ranked[0].score < 4) return undefined;
    const routeWasSpecified = !['', 'vacio', 'vacío', 'ninguno'].includes(normalize(draft.recorrido));
    const sameField = courses.filter(course => normalize(course.catalog_field ?? '') === normalize(ranked[0].course.catalog_field ?? ''));
    if (!routeWasSpecified && sameField.length > 1) return undefined;
    return ranked[0].course;
  }, [courses, draft]);

  const interpret = async (text: string) => {
    setLoading(true); setError('');
    try { setDraft(await interpretRoundVoiceLocally(text)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo interpretar la orden.'); }
    finally { setLoading(false); }
  };
  const listen = async () => {
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) { setError('Este navegador no ofrece reconocimiento de voz. Prueba con Chrome o escribe la orden.'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setError('Este navegador no permite solicitar acceso al micrófono. Escribe la orden manualmente.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
    } catch (cause) {
      const name = cause instanceof DOMException ? cause.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError('Micrófono bloqueado. Pulsa el icono de permisos junto a la dirección, permite el micrófono para localhost:5174 y recarga la página. Si sigue bloqueado, revisa Privacidad y seguridad > Micrófono en Windows.');
      } else if (name === 'NotFoundError') {
        setError('Windows no encuentra ningún micrófono disponible. Conecta o activa uno, o escribe la orden.');
      } else {
        setError('No se ha podido abrir el micrófono. Puedes escribir la orden en el campo inferior.');
      }
      return;
    }
    let useOnDeviceRecognition = false;
    if (typeof Recognition.available === 'function') {
      try {
        const availability = await Recognition.available({ langs: ['es-ES'], processLocally: true });
        if (availability === 'available') {
          useOnDeviceRecognition = true;
        } else if ((availability === 'downloadable' || availability === 'downloading') && typeof Recognition.install === 'function') {
          setListening(true);
          setError('Preparando el reconocimiento de voz en español en este dispositivo…');
          useOnDeviceRecognition = await Recognition.install({ langs: ['es-ES'], processLocally: true });
          setListening(false);
          if (!useOnDeviceRecognition) {
            setError('No se pudo instalar el reconocimiento de voz local en español. Puedes escribir la orden manualmente.');
            return;
          }
        }
      } catch {
        // Browsers without the experimental on-device API can still use their usual recognition service.
      }
    }
    const recognition = new Recognition();
    recognition.lang = 'es-ES'; recognition.interimResults = false; recognition.maxAlternatives = 1;
    if ('processLocally' in recognition) recognition.processLocally = useOnDeviceRecognition;
    recognition.onstart = () => { setListening(true); setError(''); };
    recognition.onend = () => setListening(false);
    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('El reconocimiento de voz está bloqueado por el navegador. Permite el micrófono para localhost:5174, recarga y vuelve a intentarlo; también puedes escribir la orden.');
      } else if (event.error === 'no-speech') {
        setError('No se ha detectado voz. Acércate al micrófono y vuelve a intentarlo.');
      } else if (event.error === 'network') {
        setError('El servicio de voz del navegador no tiene conexión. Actualiza Chrome para usar el reconocimiento local o escribe la orden; Ollama seguirá interpretándola en tu ordenador.');
      } else if (event.error === 'language-not-supported') {
        setError('El navegador no dispone del reconocimiento local en español. Actualiza Chrome o escribe la orden manualmente.');
      } else {
        setError(`No se pudo escuchar (${event.error}). Puedes escribir la orden manualmente.`);
      }
    };
    recognition.onresult = (event: any) => { const text = event.results[0][0].transcript; setTranscript(text); void interpret(text); };
    recognition.start();
  };

  return <section className="rounded-xl border border-violet-300 bg-violet-50 p-3 dark:border-violet-700 dark:bg-violet-950/40">
    <div className="flex items-center justify-between gap-2"><div><p className="font-bold text-violet-900 dark:text-violet-100">Crear con IA local</p><p className="text-xs text-violet-700 dark:text-violet-300">Ejemplo: “Stableford de 9 hoyos en Panorámica con Fede y Pablo”.</p></div><button type="button" onClick={listen} disabled={listening || loading} className="rounded-full bg-violet-600 p-3 text-white disabled:opacity-60" aria-label="Dictar partida">{listening ? <MicOff /> : <Mic />}</button></div>
    <div className="mt-3 flex gap-2"><input value={transcript} onChange={event => setTranscript(event.target.value)} placeholder="También puedes escribir la orden" className="min-w-0 flex-1 rounded-lg border border-violet-300 bg-card px-3 py-2" /><button type="button" onClick={() => void interpret(transcript)} disabled={!transcript.trim() || loading} className="rounded-lg bg-violet-600 px-3 text-white disabled:opacity-50">{loading ? <LoaderCircle className="animate-spin" size={18} /> : <Sparkles size={18} />}</button></div>
    {error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
    {draft && <div className="mt-3 rounded-lg bg-card p-3 text-sm"><p><strong>Campo:</strong> {(matchedCourse?.catalog_field ?? draft.campo) || 'No indicado'} {!matchedCourse && draft.campo && <span className="text-amber-600">· selección manual necesaria</span>}</p><p><strong>Recorrido:</strong> {(matchedCourse?.catalog_route ?? draft.recorrido) || 'No indicado'}</p><p><strong>Modalidad:</strong> {draft.modalidad || 'No indicada'} · <strong>Hoyos:</strong> {draft.hoyos || 'No indicados'}</p><p><strong>Jugadores detectados:</strong> {draft.jugadores.join(', ') || 'Ninguno'}</p><button type="button" onClick={() => onApply({ courseId: matchedCourse?.id, gameMode: draft.modalidad || undefined, holes: draft.hoyos || undefined, players: draft.jugadores })} className="mt-3 w-full rounded-lg bg-violet-600 py-2 font-bold text-white">Aplicar al formulario</button><p className="mt-2 text-xs text-ink-3">Revisa el formulario antes de crear la partida. Si el campo no coincide con seguridad, no se cambia. Los jugadores se muestran como propuesta para la siguiente pantalla.</p></div>}
  </section>;
}
