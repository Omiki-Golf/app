import { useEffect, useState } from 'react';
import { Bot, LoaderCircle, Sparkles } from 'lucide-react';
import { analyzeRoundLocally, type RoundAnalysis } from './localAiClient';

export default function LocalRoundAnalysis({ roundData, highlights, stats }: { roundData: any; highlights: any[]; stats: any }) {
  const [analysis, setAnalysis] = useState<RoundAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setAnalysis(null); setError(''); }, [roundData?.round?.id]);

  const run = async () => {
    setLoading(true); setError('');
    try {
      setAnalysis(await analyzeRoundLocally({
        modalidad: roundData.round?.game_mode,
        campo: roundData.course?.name,
        resultado_oficial: roundData.round?.decided_result,
        jugadores: highlights.map(item => ({
          nombre: item.playerName, puntos: item.totalPoints, golpes: item.totalGrossStrokes,
          contra_par: item.scoreToPar?.display, birdies: item.birdies, pares: item.pares,
          bogeys: item.bogeys, dobles_o_peor: item.doubleBogeyPlus,
          mejor_hoyo: item.bestHole, peor_hoyo: item.worstHole,
        })),
        clasificacion: stats?.ranking?.map((entry: any) => ({ nombre: entry.player?.name, puntos: entry.totalPoints })),
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo conectar con la IA local.');
    } finally { setLoading(false); }
  };

  return <section className="mb-6 rounded-2xl border border-violet-400/40 bg-violet-950/50 p-4 text-white shadow-xl">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="flex items-center gap-2 font-bold text-violet-200"><Bot size={20} /> Prueba IA local</p><p className="text-xs text-violet-300">Procesado únicamente en este ordenador mediante Ollama.</p></div>
      <button type="button" onClick={() => void run()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 font-bold hover:bg-violet-500 disabled:opacity-60">
        {loading ? <LoaderCircle className="animate-spin" size={18} /> : <Sparkles size={18} />}{loading ? 'Analizando…' : 'Analizar partida'}
      </button>
    </div>
    {error && <p role="alert" className="mt-3 rounded-lg bg-red-950 p-3 text-sm text-red-100">{error} Comprueba que Ollama esté abierto y que el modelo esté descargado.</p>}
    {analysis && <div className="mt-4 space-y-3"><h3 className="text-xl font-black text-violet-100">{analysis.titular}</h3><p>{analysis.resumen}</p><div className="grid gap-4 md:grid-cols-2"><div><h4 className="font-bold text-violet-200">Claves</h4><ul className="mt-1 list-disc pl-5">{analysis.claves.map(item => <li key={item}>{item}</li>)}</ul></div><div><h4 className="font-bold text-violet-200">Para la próxima</h4><ul className="mt-1 list-disc pl-5">{analysis.recomendaciones.map(item => <li key={item}>{item}</li>)}</ul></div></div><blockquote className="rounded-lg bg-black/20 p-3 text-sm">{analysis.texto_compartir}</blockquote></div>}
  </section>;
}
