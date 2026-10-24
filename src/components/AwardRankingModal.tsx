import React from 'react';
import { X } from 'lucide-react';

interface RankingEntry {
  player_name: string;
  player_id: string;
  value: number;
  handicap: number | null;
  rounds_played: number;
}

interface AwardRankingModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  ranking: RankingEntry[];
  valueLabel: string;
  colorScheme: {
    bg: string;
    border: string;
    text: string;
    accent: string;
  };
}

export const AwardRankingModal: React.FC<AwardRankingModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  ranking,
  valueLabel,
  colorScheme,
}) => {
  if (!isOpen) return null;

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
              className="text-ink-2 hover:text-ink transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)]">
          {ranking.length === 0 ? (
            <p className="text-center text-ink-3 py-8">No hay datos disponibles</p>
          ) : (
            <div className="space-y-3">
              {ranking.map((entry, index) => (
                <div
                  key={entry.player_id || `${entry.player_name}-${index}`}
                  className={`p-4 rounded-lg border flex items-center justify-between transition-all ${
                    index === 0
                      ? `${colorScheme.bg} ${colorScheme.border} border-2 shadow-card`
                      : index === 1
                      ? 'bg-card-2 border-line-2 border-2 shadow-soft'
                      : index === 2
                      ? 'bg-amber-50 border-amber-400 border-2 shadow-soft'
                      : 'bg-card border-line hover:bg-card-2'
                  }`}
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div
                      className={`text-xl font-bold w-10 h-10 flex items-center justify-center rounded-full ${
                        index === 0
                          ? `${colorScheme.accent} ${colorScheme.text}`
                          : index === 1
                          ? 'bg-ink-4 text-white'
                          : index === 2
                          ? 'bg-amber-500 text-amber-950'
                          : 'bg-neutral-hover text-ink-2'
                      }`}
                    >
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-lg text-ink">{entry.player_name}</p>
                      <div className="flex gap-4 text-sm text-ink-3 mt-1">
                        <span>{entry.rounds_played} partidas</span>
                        {entry.handicap !== null && entry.handicap !== undefined && (
                          <span>HCP Medio: {Number(entry.handicap).toFixed(1)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-3xl font-bold ${index === 0 ? colorScheme.text : 'text-ink-2'}`}>
                      {entry.value}
                    </p>
                    <p className="text-xs text-ink-3 mt-1">{valueLabel}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};