import { WriteButton } from '../context/ReadOnlyContext';
import React from 'react';
import { Trophy } from 'lucide-react';

interface HoleInOneModalProps {
  playerName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const HoleInOneModal: React.FC<HoleInOneModalProps> = ({
  playerName,
  onConfirm,
  onCancel,
}) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg shadow-card max-w-md w-full p-6 animate-fadeIn">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-yellow-100 p-3 rounded-full">
            <Trophy className="text-yellow-800" size={32} />
          </div>
          <h2 className="text-2xl font-bold text-ink">¡Hoyo en Uno!</h2>
        </div>

        <p className="text-ink-2 mb-6 text-lg">
          ¿<strong>{playerName}</strong> realmente hizo hoyo en uno (1 golpe)?
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 bg-neutral hover:bg-neutral-hover text-ink font-semibold py-3 px-4 rounded-lg transition-colors"
          >
            No, corregir
          </button>
          <WriteButton
            onClick={onConfirm}
            className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-amber-950 font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Trophy size={20} />
            ¡Sí, hole-in-one!
          </WriteButton>
        </div>
      </div>
    </div>
  );
};
