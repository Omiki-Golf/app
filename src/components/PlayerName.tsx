import { Skull } from 'lucide-react';
import { parseDeletedPlayer } from '../utils/deletedPlayer';

/**
 * Nombre de un jugador. Si se dio de baja, conserva su nick en gris con una calavera
 * (text-ink-4 se adapta al modo claro y oscuro).
 */
export function PlayerName({ name, className = '' }: { name?: string | null; className?: string }) {
  const { deleted, nick } = parseDeletedPlayer(name);
  if (!deleted) return <>{nick}</>;
  return (
    <span className={`inline-flex min-w-0 max-w-full items-center gap-1 align-middle text-ink-4 ${className}`} title={`${nick} (se dio de baja)`}>
      <Skull size="1em" className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{nick}</span>
      <span className="sr-only"> (se dio de baja)</span>
    </span>
  );
}
