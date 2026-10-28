import { useEffect, useState } from 'react';

const OMIKI_O = '/images/Omiki_O_VerdeAmarillo_Trans_Optimizada.png';
let lastVisibleAt = 0;

// Spinner de Omiki: la O del logo late mientras dos aros verdes giran a su alrededor.
export function OmikiSpinner({ size = 120, className = '' }: { size?: number; className?: string }) {
  return (
    <div className={`omiki-spinner relative shrink-0 ${className}`} style={{ width: size, height: size * 0.92 }} aria-hidden="true">
      <span className="omiki-spinner-ring omiki-spinner-ring--slow" />
      <span className="omiki-spinner-ring" />
      <img src={OMIKI_O} alt="" width={280} height={342} decoding="async" className="omiki-spinner-logo" style={{ width: size * 0.47 }} />
    </div>
  );
}

/**
 * Pantalla de carga a pantalla completa con el spinner de Omiki.
 * Solo aparece si la carga dura más de `delayMs`: las cargas rápidas no muestran nada.
 */
export function OmikiLoadingScreen({ label = 'Cargando…', delayMs = 250, className = 'bg-app' }: { label?: string; delayMs?: number; className?: string }) {
  // Si otra pantalla de carga se acaba de ver (comprobaciones seguidas al abrir la app),
  // esta aparece al instante para que el spinner no desaparezca y vuelva entre pasos.
  const [visible, setVisible] = useState(() => delayMs <= 0 || Date.now() - lastVisibleAt < 1000);
  useEffect(() => {
    if (visible) return;
    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, visible]);
  useEffect(() => {
    if (!visible) return;
    lastVisibleAt = Date.now();
    return () => { lastVisibleAt = Date.now(); };
  }, [visible]);

  return (
    <div className={`min-h-screen flex items-center justify-center ${className}`} role="status" aria-live="polite">
      {visible ? (
        <div className="flex flex-col items-center gap-3">
          <OmikiSpinner />
          <p className="text-sm font-medium text-ink-3">{label}</p>
        </div>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </div>
  );
}
