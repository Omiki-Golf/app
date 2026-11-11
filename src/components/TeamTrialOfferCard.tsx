import { useState } from 'react';
import { Gift } from 'lucide-react';
import { TEAM_TRIAL_OFFER_PRICE } from '../utils/teamTrialOffer';

export interface TeamTrialOffer {
  endsAt: Date;
  onAccept: () => Promise<void>;
}

const euros = (value: number) => value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Oferta de fin de prueba Team: Team anual a 29,99 € el primer año si se contrata antes de que acabe la prueba. */
export function TeamTrialOfferCard({ offer, className = '' }: { offer: TeamTrialOffer; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const until = offer.endsAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });

  return (
    <section className={`rounded-2xl border border-amber-400/60 bg-amber-50 p-4 text-amber-950 shadow-card dark:bg-amber-500/10 dark:text-amber-100 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-xl bg-amber-400/25 p-2 text-amber-700 dark:text-amber-300"><Gift size={20} /></div>
        <div className="min-w-0">
          <h2 className="font-bold">Quédate en Team por {euros(TEAM_TRIAL_OFFER_PRICE)} €</h2>
          <p className="mt-1 text-sm">
            Contrata Team anual antes del {until} y el primer año te cuesta {euros(TEAM_TRIAL_OFFER_PRICE)} € en vez de 39,99 €.
            Se descuenta lo que te quede de Player.
          </p>
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await offer.onAccept();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'No se ha podido abrir la oferta. Reintenta.');
            setBusy(false);
          }
        }}
        className="mt-3 w-full rounded-xl bg-amber-500 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-60"
      >
        {busy ? 'Abriendo…' : 'Contratar Team con la oferta'}
      </button>
    </section>
  );
}
