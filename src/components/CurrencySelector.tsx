import { useTranslation } from 'react-i18next';
import { displayCurrencyForLanguage } from '../utils/currency';

export function useDisplayCurrency() {
  const { i18n } = useTranslation();
  return displayCurrencyForLanguage(i18n.resolvedLanguage || i18n.language);
}

export function CurrencySelector() {
  const { t } = useTranslation();
  const currency = useDisplayCurrency();
  return (
    <div className="text-center text-xs text-ink-3" aria-label={t('currency.label')}>
      {currency === 'GBP' ? '£ GBP · aprox.' : '€ EUR'}
    </div>
  );
}
