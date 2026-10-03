import React, { useState } from 'react';
import { Lock, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AccessCodeModalProps {
  onSubmit: (code: string) => void;
  onCancel: () => void;
  error?: string;
  loading?: boolean;
}

export const AccessCodeModal: React.FC<AccessCodeModalProps> = ({
  onSubmit,
  onCancel,
  error,
  loading = false,
}) => {
  const { t } = useTranslation();
  const [code, setCode] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim()) {
      onSubmit(code.trim());
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value.length <= 20) {
      setCode(value);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-lg shadow-card max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-accent-soft p-3 rounded-full">
              <Lock className="text-accent-ink" size={24} />
            </div>
            <h2 className="text-xl font-bold text-ink">
              {t('access.title')}
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
          {t('access.description')}
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-ink-2 mb-2">
              {t('access.title')}
            </label>
            <input
              type="text"
              value={code}
              onChange={handleInputChange}
              placeholder={t('access.placeholder')}
              className="w-full px-4 py-3 border-2 border-line-2 rounded-lg focus:border-accent focus:outline-none text-center text-2xl font-bold tracking-wider font-mono"
              autoFocus
              maxLength={20}
              disabled={loading}
            />
            <p className="text-xs text-ink-3 mt-2 text-center">
              {t('access.hint')}
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
              disabled={loading}
              className="flex-1 bg-neutral hover:bg-neutral-hover disabled:opacity-50 text-ink font-semibold py-3 rounded-lg transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading || code.length < 4}
              className="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-on-accent font-semibold py-3 rounded-lg transition-colors"
            >
              {loading ? t('access.verifying') : t('access.enter')}
            </button>
          </div>
        </form>

        <div className="mt-6 pt-4 border-t border-line">
          <p className="text-xs text-ink-3 text-center">
            {t('access.footer')}
          </p>
        </div>
      </div>
    </div>
  );
};
