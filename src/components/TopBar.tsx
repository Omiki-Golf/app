import type { ReactNode } from 'react';

interface TopBarProps {
  left?: ReactNode;
  /** Normalmente el botón de avisos, centrado como en el resto de la app. */
  center?: ReactNode;
  right?: ReactNode;
  className?: string;
}

// Fila superior común: los tres grupos quedan a la misma altura (botones de 44 px).
export function TopBar({ left, center, right, className = 'mb-6' }: TopBarProps) {
  return (
    <div className={`grid grid-cols-[1fr_auto_1fr] items-center gap-2 ${className}`}>
      <div className="flex min-w-0 items-center gap-2">{left}</div>
      <div className="flex justify-center">{center}</div>
      <div className="flex min-w-0 items-center justify-end gap-2">{right}</div>
    </div>
  );
}
