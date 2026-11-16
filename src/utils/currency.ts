export const supportedCurrencies = ['EUR', 'GBP'] as const;
export type DisplayCurrency = (typeof supportedCurrencies)[number];

// Solo se usa para la estimación previa de la web. Stripe calcula y muestra
// el cambio definitivo en Checkout mediante Adaptive Pricing.
export const GBP_PER_EUR_APPROX = 0.87;

export const displayCurrencyForLanguage = (language?: string): DisplayCurrency =>
  language?.split('-')[0] === 'en' ? 'GBP' : 'EUR';

export function formatDisplayPrice(euros: number, currency: DisplayCurrency, language = 'es') {
  const locale = language === 'en' ? 'en-GB' : language === 'fr' ? 'fr-FR' : language === 'it' ? 'it-IT' : 'es-ES';
  const amount = currency === 'GBP' ? euros * GBP_PER_EUR_APPROX : euros;
  const formatted = new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  return currency === 'GBP' ? `≈${formatted}` : formatted;
}
