import { useId, useState } from 'react';
import { Info } from 'lucide-react';

/** Ayuda del campo de hándicap al añadir un jugador a una partida. */
export const GAME_POINTS_HINT =
  'Son los puntos de juego que se reparten en la tarjeta: los golpes de ventaja que recibe el jugador en los hoyos de esta partida.';

interface InfoHintProps {
  /** Texto de ayuda que aparece al pulsar la «i». */
  text: string;
  label?: string;
}

/**
 * Botón «i» que muestra u oculta una ayuda breve justo debajo de su etiqueta.
 * Va en línea (sin capas flotantes) para funcionar bien dentro de modales y en móvil.
 */
export function InfoHint({ text, label = 'Más información' }: InfoHintProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        className="inline-flex items-center justify-center p-0.5 rounded-full text-accent-ink hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Info size={15} aria-hidden="true" />
      </button>
      {open && (
        <span id={id} role="note" className="mt-1 block w-full text-xs font-normal text-ink-2 bg-card-2 border border-line rounded-lg px-2.5 py-2 leading-relaxed">
          {text}
        </span>
      )}
    </>
  );
}
