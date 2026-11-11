import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DisplayCurrency, readDisplayCurrency, saveDisplayCurrency, subscribeDisplayCurrency } from '../utils/currency';

export function useDisplayCurrency() {
  const [currency, setCurrency] = useState<DisplayCurrency>(() => readDisplayCurrency());
  useEffect(() => subscribeDisplayCurrency(setCurrency), []);
  return currency;
}

export function CurrencySelector() {
  const { t } = useTranslation();
  const currency = useDisplayCurrency();
  return (
    <div className="flex items-center justify-center gap-2" aria-label={t('currency.label')}>
      <div className="inline-flex rounded-full border border-line bg-card-2 p-1" role="group">
        {(['EUR', 'GBP'] as const).map(value => (
          <button
            key={value}
            type="button"
            aria-pressed={currency === value}
            onClick={() => saveDisplayCurrency(value)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${currency === value ? 'bg-accent text-on-accent' : 'text-ink-3 hover:text-ink'}`}
          >
            {value === 'EUR' ? '€ EUR' : '£ GBP'}
          </button>
        ))}
      </div>
      {currency === 'GBP' && <span className="text-[10px] text-ink-3">{t('currency.approxShort')}</span>}
    </div>
  );
}
