import { LOCAL_AI_MODEL } from './config';

interface LocalAiResponse<T> { message?: { content?: string }; error?: string }

async function structuredChat<T>(system: string, payload: unknown, schema: object): Promise<T> {
  const response = await fetch('/local-ai/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LOCAL_AI_MODEL,
      stream: false,
      format: schema,
      options: { temperature: 0 },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(payload) },
      ],
    }),
  });
  const body = await response.json().catch(() => ({})) as LocalAiResponse<T>;
  if (!response.ok) throw new Error(body.error || `Ollama respondió con HTTP ${response.status}.`);
  if (!body.message?.content) throw new Error('Ollama no devolvió contenido.');
  return JSON.parse(body.message.content) as T;
}

export interface RoundAnalysis {
  titular: string;
  resumen: string;
  claves: string[];
  recomendaciones: string[];
  texto_compartir: string;
}

export const analyzeRoundLocally = (payload: unknown) => structuredChat<RoundAnalysis>(
  'Eres un analista de golf. Interpreta solo los datos recibidos, no inventes golpes ni resultados. Responde en español, de forma amistosa, concreta y útil.',
  payload,
  {
    type: 'object',
    properties: {
      titular: { type: 'string' },
      resumen: { type: 'string' },
      claves: { type: 'array', items: { type: 'string' } },
      recomendaciones: { type: 'array', items: { type: 'string' } },
      texto_compartir: { type: 'string' },
    },
    required: ['titular', 'resumen', 'claves', 'recomendaciones', 'texto_compartir'],
  },
);

export interface VoiceRoundDraft {
  campo: string;
  recorrido: string;
  modalidad: 'stableford' | 'match' | 'sindicato' | 'parejas' | '';
  hoyos: 9 | 18 | 0;
  jugadores: string[];
}

export const interpretRoundVoiceLocally = (transcript: string) => structuredChat<VoiceRoundDraft>(
  'Extrae literalmente una propuesta de partida de golf en español. campo es únicamente el nombre dicho después de "en" o "campo"; recorrido es únicamente el recorrido mencionado. No inventes ni uses palabras genéricas como golf, partida o estadísticas. modalidad solo puede ser stableford, match, sindicato, parejas o cadena vacía. hoyos solo 9, 18 o 0. Separa los nombres posteriores a "con" como jugadores. Ejemplo: "Stableford de 9 hoyos en Panorámica con Fede y Pablo" significa campo Panorámica, recorrido vacío, modalidad stableford, 9 hoyos, jugadores Fede y Pablo.',
  { transcript },
  {
    type: 'object',
    properties: {
      campo: { type: 'string' }, recorrido: { type: 'string' },
      modalidad: { type: 'string', enum: ['stableford', 'match', 'sindicato', 'parejas', ''] },
      hoyos: { type: 'integer', enum: [0, 9, 18] },
      jugadores: { type: 'array', items: { type: 'string' } },
    },
    required: ['campo', 'recorrido', 'modalidad', 'hoyos', 'jugadores'],
  },
);
