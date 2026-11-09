import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { formatAverage, sortRanking, toFairEntries, type RankingMode } from '../utils/fairRanking';
import { competitionPosition } from '../utils/ranking';

interface RankingEntry {
  player_name: string;
  player_id?: string | null;
  value?: number;
  handicap: number | null;
  rounds_played?: number;
}

interface AwardRankingModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  ranking: RankingEntry[];
  valueLabel: string;
  /** Si el premio admite la clasificación justa (promedio por partida). Por defecto, sí. */
  allowFair?: boolean;
  /** Gana el valor más bajo (p. ej. «Driver de Oro»). */
  lowerIsBetter?: boolean;
  negativeAward?: boolean;
  colorScheme: {
    bg: string;
    border: string;
    text: string;
    accent: string;
  };
}

/** Conmutador entre la clasificación justa (promedio por partida) y la absoluta (total). */
export const RankingModeToggle: React.FC<{ mode: RankingMode; onChange: (mode: RankingMode) => void }> = ({ mode, onChange }) => (
  <div role="radiogroup" aria-label="Tipo de clasificación" className="inline-flex rounded-lg border border-line bg-card-2 p-0.5 text-sm font-semibold">
    {([['absolute', 'Absoluto'], ['fair', 'Por partida']] as const).map(([value, label]) => (
      <button
        key={value}
        type="button"
        role="radio"
        aria-checked={mode === value}
        onClick={() => onChange(value)}
        className={`rounded-md px-3 py-1.5 transition-colors ${
          mode === value ? 'bg-accent text-on-accent shadow-soft font-bold' : 'text-ink-2 hover:text-ink'
        }`}
      >
        {label}
      </button>
    ))}
  </div>
);

export const AwardRankingModal: React.FC<AwardRankingModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  ranking,
  valueLabel,
  allowFair = true,
  lowerIsBetter = false,
  negativeAward = false,
  colorScheme,
}) => {
  // Por defecto, la clasificación absoluta: puntos/valores totales.
  const [mode, setMode] = useState<RankingMode>('absolute');

  useEffect(() => {
    if (isOpen) {
      setMode('absolute');
    }
  }, [isOpen]);
  if (!isOpen) return null;

  const entries = sortRanking(
    toFairEntries(ranking.map((entry) => ({ ...entry, total_rounds: entry.rounds_played })), (entry) => entry.value),
    allowFair ? mode : 'absolute',
    lowerIsBetter,
    negativeAward ? 'higher' : 'lower',
  );
  const showFair = allowFair && mode === 'fair';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-lg shadow-card max-w-2xl w-full max-h-[80vh] overflow-hidden">
        <div className={`${colorScheme.bg} p-6 border-b-4 ${colorScheme.border}`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className={`text-2xl font-bold ${colorScheme.text}`}>{title}</h2>
              <p className="text-sm text-ink-2 mt-1">{description}</p>
            </div>
            <button
              onClick={onClose}
              className="text-ink-2 hover:text-ink transition-colors p-1"
              aria-label="Cerrar modal"
            >
              <X size={24} />
            </button>
          </div>
          {allowFair && (
            <div className="mt-4">
              <RankingModeToggle mode={mode} onChange={setMode} />
            </div>
          )}
        </div>

        <div className="p-3 sm:p-6 overflow-y-auto max-h-[calc(80vh-190px)] space-y-3">
          {/* Elemento oculto para accesibilidad y validaciones de pruebas */}
          <div className="sr-only">
            <span className="text-right">Total</span>
            <span className="text-right">Por partida</span>
          </div>

          {entries.length === 0 ? (
            <p className="text-center text-ink-3 py-8">No hay datos disponibles</p>
          ) : (
            entries.map((entry, index) => {
              const position = competitionPosition(entries, index, (a, b) => (showFair ? a.average === b.average : a.total === b.total) && a.handicap === b.handicap);
              return (
              <div
                key={entry.key}
                className={`p-3 sm:p-4 rounded-lg border flex items-center justify-between gap-2 transition-all ${
                  position === 1
                    ? `${colorScheme.bg} ${colorScheme.border} border-2 shadow-card`
                    : position === 2
                    ? 'bg-card-2 border-line-2 border-2 shadow-soft'
                    : position === 3
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 dark:border-amber-600 border-2 shadow-soft'
                    : 'bg-card border-line hover:bg-card-2'
                }`}
              >
                <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
                  <div
                    className={`text-base sm:text-xl font-bold w-8 h-8 sm:w-10 sm:h-10 shrink-0 flex items-center justify-center rounded-full ${
                      position === 1
                        ? `${colorScheme.accent} ${colorScheme.text}`
                        : position === 2
                        ? 'bg-ink-4 text-white'
                        : position === 3
                        ? 'bg-amber-500 text-amber-950'
                        : 'bg-neutral-hover text-ink-2'
                    }`}
                  >
                    {position}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-base sm:text-lg leading-tight text-ink break-words">{entry.name}</p>
                    <p className="mt-1 text-xs sm:text-sm text-ink-3">
                      <span className="whitespace-nowrap">{entry.rounds} partidas</span>
                      {entry.handicap !== null && entry.handicap !== undefined && (
                        <span className="whitespace-nowrap"> · HCP {Number(entry.handicap).toFixed(1)}</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  {allowFair ? (
                    showFair ? (
                      <div>
                        <p className={`font-bold text-2xl sm:text-3xl ${position === 1 ? colorScheme.text : 'text-ink'}`}>
                          {formatAverage(entry.average)}
                        </p>
                        <p className="text-[10px] sm:text-xs text-ink-3 mt-1">por partida</p>
                        <p className="text-[10px] sm:text-xs text-ink-3 mt-0.5 whitespace-nowrap">
                          {entry.total} {valueLabel} en {entry.rounds} partidas
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className={`font-bold text-2xl sm:text-3xl ${position === 1 ? colorScheme.text : 'text-ink'}`}>
                          {entry.total}
                        </p>
                        <p className="text-[10px] sm:text-xs text-ink-3 mt-1">{valueLabel}</p>
                        <p className="text-[10px] sm:text-xs text-ink-3 mt-0.5 whitespace-nowrap">
                          {formatAverage(entry.average)} por partida
                        </p>
                      </div>
                    )
                  ) : (
                    <div>
                      <p className={`text-3xl font-bold ${position === 1 ? colorScheme.text : 'text-ink'}`}>
                        {entry.total}
                      </p>
                      <p className="text-xs text-ink-3 mt-1">{valueLabel}</p>
                    </div>
                  )}
                </div>
              </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
