import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectMenuOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

interface SelectMenuProps {
  value: string;
  options: SelectMenuOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  /** Texto del botón cuando ninguna opción coincide con el valor. */
  placeholder?: React.ReactNode;
  /** Icono a la izquierda del botón y de cada opción. */
  icon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

// Desplegable de la app, con el mismo aspecto que el selector de partidas de las estadísticas:
// botón redondeado y lista flotante con la opción elegida resaltada y marcada.
export function SelectMenu({ value, options, onChange, ariaLabel, placeholder = 'Selecciona…', icon, disabled = false, className = '' }: SelectMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find(option => option.value === value);

  useEffect(() => {
    if (!open) return;
    const closeFromOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeFromOutside);
    document.addEventListener('keydown', closeFromKeyboard);
    // Al abrir, el foco va a la opción elegida (o a la primera) para poder usar el teclado.
    const target = listRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]:not(:disabled)')
      ?? listRef.current?.querySelector<HTMLButtonElement>('[role="option"]:not(:disabled)');
    target?.focus({ preventScroll: false });
    return () => {
      document.removeEventListener('pointerdown', closeFromOutside);
      document.removeEventListener('keydown', closeFromKeyboard);
    };
  }, [open]);

  const moveFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ?? []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'ArrowDown' ? Math.min(items.length - 1, index + 1) : Math.max(0, index - 1);
    items[next]?.focus();
  };

  const choose = (option: SelectMenuOption) => {
    if (option.disabled) return;
    setOpen(false);
    if (option.value !== value) onChange(option.value);
  };

  return (
    <div ref={rootRef} className={`relative w-full ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(current => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        className={`flex min-h-12 w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left shadow-card transition focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50 ${open ? 'border-accent' : 'border-line'}`}
      >
        {icon && <span className="shrink-0 text-accent-ink" aria-hidden="true">{icon}</span>}
        <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${selected ? 'text-ink' : 'text-ink-3'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={19} aria-hidden="true" className={`shrink-0 text-accent-ink transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          onKeyDown={moveFocus}
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[min(22rem,55vh)] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-card p-2 shadow-2xl"
        >
          {options.length === 0 && <p className="px-3 py-3 text-sm text-ink-3">Sin opciones</p>}
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                onClick={() => choose(option)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${isSelected ? 'bg-accent-soft text-accent-ink' : 'text-ink hover:bg-card-2 active:bg-accent-soft'}`}
              >
                {icon && <span className="shrink-0 opacity-80" aria-hidden="true">{icon}</span>}
                <span className="min-w-0 flex-1 font-semibold leading-5">{option.label}</span>
                {isSelected && <Check size={18} className="shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
