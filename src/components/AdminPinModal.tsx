import React, { useState } from 'react';
import { Shield, X } from 'lucide-react';

interface AdminPinModalProps {
  onSubmit: (pin: string) => void;
  onCancel: () => void;
  error?: string;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({
  onSubmit,
  onCancel,
  error,
}) => {
  const [pin, setPin] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.trim()) {
      onSubmit(pin.trim());
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    if (value.length <= 4) {
      setPin(value);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-lg shadow-card max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 p-3 rounded-full">
              <Shield className="text-amber-700" size={24} />
            </div>
            <h2 className="text-xl font-bold text-ink">
              Verificación Adicional
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="text-ink-4 hover:text-ink-3 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <p className="text-ink-2 mb-6">
          Introduce tu código de acceso para continuar.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-ink-2 mb-2">
              Código de Acceso
            </label>
            <input
              type="password"
              value={pin}
              onChange={handleInputChange}
              placeholder="****"
              className="w-full px-4 py-3 border-2 border-line-2 rounded-lg focus:border-amber-500 focus:outline-none text-center text-2xl font-bold tracking-widest"
              autoFocus
              maxLength={4}
              inputMode="numeric"
            />
            <p className="text-xs text-ink-3 mt-2 text-center">
              4 dígitos numéricos
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded mb-4">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 bg-neutral hover:bg-neutral-hover text-ink font-semibold py-3 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pin.length !== 4}
              className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-amber-950 font-semibold py-3 rounded-lg transition-colors"
            >
              Verificar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
