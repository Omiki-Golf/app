import React from 'react';
import type { FinalResult } from '../utils/finalResult';

interface FinalResultModalProps {
  result: FinalResult;
  onClose: () => void;
}

const modeLabels: Record<FinalResult['mode'], string> = {
  match: 'Match Play',
  sindicato: 'Sindicato',
  parejas: 'Parejas',
};

const positionLabels = ['1º', '2º', '3º', '4º'];

export const FinalResultModal: React.FC<FinalResultModalProps> = ({ result, onClose }) => {
  const headline = result.mode === 'match'
    ? `Ha ganado ${result.winnerLabel} por ${result.resultText}`
    : result.mode === 'parejas'
      ? `Ha ganado la pareja ${result.winnerLabel}`
      : `Ha ganado ${result.winnerLabel}`;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="final-result-title"
    >
      <div className="bg-card rounded-2xl shadow-card max-w-sm w-full p-6 text-center transform animate-in fade-in zoom-in duration-200">
        <div className="w-16 h-16 bg-accent-soft rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
          🏆
        </div>

        <h2 id="final-result-title" className="text-2xl font-bold text-ink mb-1">Resultado final</h2>
        <p className="text-sm text-ink-3 mb-6 uppercase tracking-wider font-semibold">{modeLabels[result.mode]}</p>

        <div className="bg-accent-soft border border-accent-ring rounded-xl p-4 mb-5">
          <p className="text-lg font-extrabold text-accent-ink">{headline}</p>
          {result.mode === 'parejas' && (
            <span className="mt-2 inline-block bg-accent text-on-accent text-xs font-bold px-3 py-1 rounded-full">
              Resultado: {result.resultText}
            </span>
          )}
          {result.decidedByHandicap && (
            <p className="mt-2 text-xs font-medium text-accent-ink">
              Empate a puntos: gana {result.mode === 'parejas' ? 'la pareja' : 'el jugador'} de hándicap más bajo.
            </p>
          )}
        </div>

        {result.mode === 'sindicato' && (
          <ol className="mb-5 space-y-2 text-left">
            {result.standings.map((standing) => (
              <li
                key={standing.label}
                className="flex items-center justify-between rounded-lg bg-card-2 px-3 py-2 text-sm"
              >
                <span className="font-semibold text-ink">
                  {positionLabels[standing.position - 1]} {standing.label}
                </span>
                <span className="font-bold text-ink-2">{standing.points} pts</span>
              </li>
            ))}
          </ol>
        )}

        <button
          type="button"
          onClick={onClose}
          autoFocus
          className="w-full bg-accent hover:bg-accent-hover text-on-accent font-bold py-3 px-4 rounded-xl transition-colors shadow-card shadow-emerald-600/30"
        >
          Aceptar
        </button>
      </div>
    </div>
  );
};
