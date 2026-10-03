import { useReadOnly } from '../context/ReadOnlyContext';
import React from 'react';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ConfirmModalProps {
  message: string;
  readOnlySensitive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  message,
  readOnlySensitive = true,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const restricted = useReadOnly() && readOnlySensitive;
  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!restricted) onConfirm();
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
            disabled={restricted}
            onClick={handleConfirm}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {t('common.accept')}
          </button>
        </div>
      </div>
    </div>
  );
};
