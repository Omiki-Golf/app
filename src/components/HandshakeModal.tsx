import React from 'react';

interface HandshakeModalProps {
  isOpen: boolean;
  winnerName: string;
  marginText: string;
  gameMode: string;
  onContinue: () => void;
  onFinishRound?: () => void;
}

export const HandshakeModal: React.FC<HandshakeModalProps> = ({
  isOpen,
  winnerName,
  marginText,
  gameMode,
  onContinue,
  onFinishRound,
}) => {
  if (!isOpen) return null;

  const handleFinish = async () => {
    if (onFinishRound) await onFinishRound();
  };

  const modeLabel = gameMode === 'match'
    ? 'Match Play'
    : gameMode === 'sindicato'
      ? 'Sindicato'
      : 'Parejas';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-2xl shadow-card max-w-sm w-full p-6 text-center transform animate-in fade-in zoom-in duration-200">
        <div className="w-16 h-16 bg-accent-soft rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
          🤝
        </div>

        <h2 className="text-2xl font-bold text-ink mb-1">¡Partida decidida!</h2>
        <p className="text-sm text-ink-3 mb-6 uppercase tracking-wider font-semibold">{modeLabel}</p>

        <div className="bg-accent-soft border border-accent-ring rounded-xl p-4 mb-5">
          <p className="text-xs text-accent-ink font-medium mb-1">Ganador</p>
          <p className="text-xl font-extrabold text-emerald-950 mb-2">{winnerName}</p>
          <span className="inline-block bg-accent text-on-accent text-xs font-bold px-3 py-1 rounded-full">
            Resultado: {marginText}
          </span>
        </div>

        <p className="text-sm text-ink-2 font-medium mb-4">
          El resultado ya está decidido. ¿Quieres seguir anotando hoyos o finalizar la partida ahora?
        </p>

        <div className="space-y-3">
          <button
            type="button"
            onClick={onContinue}
            className="w-full bg-accent hover:bg-accent-hover text-on-accent font-bold py-3 px-4 rounded-xl transition-colors shadow-card shadow-emerald-600/30"
          >
            Seguir jugando
          </button>
          {onFinishRound && <button
            type="button"
            onClick={handleFinish}
            className="w-full bg-neutral hover:bg-neutral-hover text-ink font-bold py-3 px-4 rounded-xl transition-colors"
          >
            Finalizar partida
          </button>}
        </div>
      </div>
    </div>
  );
};
