import { supabase } from './supabaseClient';
import { APP_VERSION } from '../data/releaseNotes';
import { isChunkLoadError } from '../utils/chunkError';

export { isChunkLoadError };

export type ClientErrorKind = 'render' | 'chunk';

let currentView: string | null = null;
const recent = new Map<string, number>();

/** Pantalla visible ahora mismo: acompaña a cada error registrado. */
export const setErrorReportingView = (view: string | null): void => { currentView = view; };


type PendingReport = Record<string, string | boolean | null>;
const PENDING_KEY = 'omiki.pendingClientErrors';

const readPending = (): PendingReport[] => {
  try { return JSON.parse(window.localStorage.getItem(PENDING_KEY) || '[]') as PendingReport[]; } catch { return []; }
};
const writePending = (items: PendingReport[]): void => {
  try {
    if (items.length) window.localStorage.setItem(PENDING_KEY, JSON.stringify(items.slice(-5)));
    else window.localStorage.removeItem(PENDING_KEY);
  } catch { /* Sin almacenamiento local: el error se pierde. */ }
};

const send = async (report: PendingReport): Promise<boolean> => {
  try {
    const { error } = await supabase.rpc('log_client_error', report);
    return !error;
  } catch {
    return false;
  }
};

/** Envía los errores que no se pudieron registrar sin conexión. */
export async function flushPendingClientErrors(): Promise<void> {
  const pending = readPending();
  if (!pending.length || !navigator.onLine) return;
  const left: PendingReport[] = [];
  for (const report of pending) if (!(await send(report))) left.push(report);
  writePending(left);
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void flushPendingClientErrors(); });
  window.setTimeout(() => { void flushPendingClientErrors(); }, 5000);
}

/** Guarda el error en Supabase (o lo deja pendiente sin conexión). Nunca lanza. */
export async function reportClientError(error: unknown, componentStack?: string | null): Promise<void> {
  try {
    const err = error instanceof Error ? error : new Error(String(error ?? 'Error desconocido'));
    const kind: ClientErrorKind = isChunkLoadError(err) ? 'chunk' : 'render';
    // El mismo error repetido en pocos segundos (StrictMode, reintentos) se registra una vez.
    const key = `${kind}:${err.message}`;
    const now = Date.now();
    if (now - (recent.get(key) ?? 0) < 10000) return;
    recent.set(key, now);

    const report: PendingReport = {
      p_kind: kind,
      p_message: `${err.name}: ${err.message}`,
      p_stack: err.stack ?? null,
      p_component_stack: componentStack ?? null,
      p_view: currentView,
      p_app_version: APP_VERSION,
      p_url: window.location.origin + window.location.pathname,
      p_user_agent: navigator.userAgent,
      p_online: navigator.onLine,
    };
    if (!(await send(report))) writePending([...readPending(), report]);
  } catch {
    // Registrar nunca puede romper la recuperación de la app.
  }
}
