import React from 'react';
import { Trophy, Star } from 'lucide-react';

interface CongratulationsModalProps {
  playerName: string;
  onClose: () => void;
}

export const CongratulationsModal: React.FC<CongratulationsModalProps> = ({
  playerName,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg shadow-card max-w-md w-full p-8 animate-fadeIn border-4 border-yellow-400">
        <div className="text-center">
          <div className="flex justify-center gap-2 mb-4">
            <Star className="text-yellow-500 animate-bounce" size={40} style={{ animationDelay: '0ms' }} />
            <Trophy className="text-yellow-800" size={48} />
            <Star className="text-yellow-500 animate-bounce" size={40} style={{ animationDelay: '200ms' }} />
          </div>

          <h2 className="text-3xl font-bold text-yellow-900 mb-3">
            ¡ENHORABUENA!
          </h2>

          <p className="text-xl text-ink mb-2">
            <strong className="text-yellow-700">{playerName}</strong>
          </p>

          <p className="text-2xl font-bold text-yellow-800 mb-4">
            ¡Ha conseguido un HOYO EN UNO!
          </p>

          <div className="bg-white/50 rounded-lg p-4 mb-6">
            <p className="text-ink-2 text-sm italic">
              "Un momento extraordinario en el campo de golf.
              ¡Esta hazaña quedará en la historia!"
            </p>
          </div>

          <button
            onClick={onClose}
            className="bg-yellow-500 hover:bg-yellow-600 text-amber-950 font-bold py-3 px-8 rounded-lg transition-colors shadow-card text-lg"
          >
            ¡Gracias!
          </button>
        </div>
      </div>
    </div>
  );
};
