export const supportedCurrencies = ['EUR', 'GBP'] as const;
export type DisplayCurrency = (typeof supportedCurrencies)[number];

const CURRENCY_STORAGE_KEY = 'omiki-display-currency';
const CURRENCY_EVENT = 'omiki-currency-change';

// Solo se usa para la estimación previa de la web. Stripe calcula y muestra
// el cambio definitivo en Checkout mediante Adaptive Pricing.
export const GBP_PER_EUR_APPROX = 0.87;

export function readDisplayCurrency(): DisplayCurrency {
  const stored = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
  return supportedCurrencies.includes(stored as DisplayCurrency) ? stored as DisplayCurrency : 'EUR';
}

export function saveDisplayCurrency(currency: DisplayCurrency) {
  window.localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
  window.dispatchEvent(new CustomEvent<DisplayCurrency>(CURRENCY_EVENT, { detail: currency }));
}

export function subscribeDisplayCurrency(listener: (currency: DisplayCurrency) => void) {
  const onChange = (event: Event) => listener((event as CustomEvent<DisplayCurrency>).detail);
  const onStorage = (event: StorageEvent) => {
    if (event.key === CURRENCY_STORAGE_KEY) listener(readDisplayCurrency());
  };
  window.addEventListener(CURRENCY_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CURRENCY_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function formatDisplayPrice(euros: number, currency: DisplayCurrency, language = 'es') {
  const locale = language === 'en' ? 'en-GB' : language === 'fr' ? 'fr-FR' : language === 'it' ? 'it-IT' : 'es-ES';
  const amount = currency === 'GBP' ? euros * GBP_PER_EUR_APPROX : euros;
  const formatted = new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  return currency === 'GBP' ? `≈${formatted}` : formatted;
}
