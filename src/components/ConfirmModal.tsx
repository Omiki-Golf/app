import { useReadOnly } from '../context/ReadOnlyContext';
import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ConfirmModalProps {
  message: string;
  readOnlySensitive?: boolean;
  requiredText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  message,
  readOnlySensitive = true,
  requiredText,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [confirmationText, setConfirmationText] = useState('');
  const restricted = useReadOnly() && readOnlySensitive;
  const confirmationMatches = !requiredText || confirmationText === requiredText;
  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!restricted && confirmationMatches) onConfirm();
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onCancel();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      e.stopPropagation();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[9999]"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-card rounded-lg shadow-card max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-blue-100 p-3 rounded-full">
            <AlertCircle className="text-blue-600" size={24} />
          </div>
          <p className="text-lg text-ink font-medium">
            {message}
          </p>
        </div>

        {requiredText && (
          <div className="mt-5">
            <label className="block text-sm font-semibold text-ink-2 mb-2" htmlFor="destructive-confirmation">
              Escribe <strong>{requiredText}</strong> para confirmar
            </label>
            <input
              id="destructive-confirmation"
              type="text"
              value={confirmationText}
              onChange={(event) => setConfirmationText(event.target.value)}
              autoComplete="off"
              autoFocus
              className="w-full rounded-lg border-2 border-line-2 bg-card px-3 py-2 text-ink focus:border-red-500 focus:outline-none"
            />
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 bg-neutral hover:bg-neutral-hover text-ink font-semibold py-3 rounded-lg transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={restricted || !confirmationMatches}
            onClick={handleConfirm}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {t('common.accept')}
          </button>
        </div>
      </div>
    </div>
  );
};
