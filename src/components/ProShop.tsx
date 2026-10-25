import { WriteButton } from '../context/ReadOnlyContext';
import { NavigationButton } from './NavigationButton';
import { TopBar } from './TopBar';
import React, { useEffect, useRef, useState } from 'react';
import { Beer, CalendarDays, Check, Hand, Info, Mail, ShoppingCart, Trophy, UserPlus, Users, type LucideIcon } from 'lucide-react';

interface ProShopProps {
  groupId: string | null;
  groupName?: string;
  userId: string;
  onBack: () => void;
  onPurchaseComplete?: () => void;
  messagesButton?: React.ReactNode;
}

interface ShopItem {
  id: string;
  name: string;
  info: string;
  icon: LucideIcon;
  /** Incluido gratis en Team: siempre seleccionado. */
  free?: boolean;
  /** Necesita datos que la tarjeta aún no registra: visible pero no seleccionable. */
  comingSoon?: boolean;
}

interface Addon extends ShopItem {
  price: string;
  note: string;
}

// Mismo catálogo que la web (OmikiWEB: GamificationPack y TeamAddons).
const titles: ShopItem[] = [
  { id: 'no-paso-rojas', name: 'No paso de Rojas', icon: Beer, free: true, info: 'El jugador que no pasa de rojas (bolas de damas) en la salida paga una cerveza al resto de su partida. La tradición más sagrada del golf entre amigos, ahora digitalizada.' },
  { id: 'spanish-hand', name: 'Spanish Hand', icon: Hand, info: 'Birdie conseguido desde fuera del green. El título más patrio para los que embocan de lejos.' },
  { id: 'buceador', name: 'Buceador', icon: Trophy, comingSoon: true, info: 'El jugador con más bolas enviadas al agua durante la temporada. Un clásico entre los amigos.' },
  { id: 'minero', name: 'Minero', icon: Trophy, comingSoon: true, info: 'Rey indiscutible de los bunkers. El que más veces termina jugando desde la arena.' },
  { id: 'lumberjack', name: 'Lumberjack', icon: Trophy, comingSoon: true, info: 'El jugador que más árboles ha golpeado durante el año. Leñador honorario del grupo.' },
  { id: 'maestro-obstaculos', name: 'Maestro de Obstáculos', icon: Trophy, comingSoon: true, info: 'El que más veces se ha salvado de un obstáculo imposible y ha salvado el par o mejor.' },
  { id: 'fenomeno-tee', name: 'Fenómeno del Tee', icon: Trophy, comingSoon: true, info: 'Mejor media de drive de toda la temporada. El que más lejos llega con consistencia.' },
  { id: 'abrelatas', name: 'Abrelatas', icon: Trophy, comingSoon: true, info: 'Más bolas perdidas en todo el año. El que más pelotas ha tenido que reponer en su bolsa.' },
  { id: 'hada-patos', name: 'Hada de los Patos', icon: Trophy, comingSoon: true, info: 'El que más veces ha asustado a los patos del campo. Por las risas más que por el juego.' },
];

const addons: Addon[] = [
  { id: 'grupo-adicional', name: 'Grupo Adicional', icon: Users, price: '24,99 € / año', note: 'Máximo 3 grupos adicionales', info: '¿Tienes varios grupos? Amigos del club, compañeros del trabajo, la familia. Cada uno con su propio ranking y jugadores independientes.' },
  { id: 'ampliacion-plantilla', name: 'Ampliación de Plantilla', icon: UserPlus, price: '19,99 € / año', note: '+12 jugadores sobre el base', info: 'Pasa de 20 a 32 jugadores registrados, con participación máxima de 16 a 24 en cada jornada.' },
  { id: 'temporada-simultanea', name: 'Temporada Simultánea', icon: CalendarDays, price: '14,99 € / año', note: '2 clasificaciones paralelas', info: 'Dos clasificaciones al mismo tiempo dentro del mismo grupo. Liga anual y Match Play a la vez, o una Copa de verano paralela.' },
];

const formatEuros = (value: number) => `${value.toFixed(2).replace('.', ',')} €`;
// Precio escalonado de la web: 1,99 € el primer título de pago y 1 € más por cada uno adicional.
const titlesPrice = (paidCount: number) => (paidCount === 0 ? 0 : 1.99 + (paidCount - 1));
const CONTACT_EMAIL = 'hola@omikigolf.com';

export const ProShop: React.FC<ProShopProps> = ({ groupId, groupName, userId, onBack, messagesButton }) => {
  const [selectedTitles, setSelectedTitles] = useState<Set<string>>(() => new Set(titles.filter(item => item.free).map(item => item.id)));
  const [selectedAddons, setSelectedAddons] = useState<Set<string>>(new Set());

  const toggle = (set: Set<string>, setter: (next: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  };

  const paidTitles = titles.filter(item => !item.free && selectedTitles.has(item.id));
  const chosenAddons = addons.filter(item => selectedAddons.has(item.id));
  const hasRequest = paidTitles.length > 0 || chosenAddons.length > 0;

  const requestHref = () => {
    const lines = [
      'Hola, queremos añadir a nuestro Team:',
      '',
      ...(paidTitles.length ? ['Pack de Gamificación:', ...paidTitles.map(item => `- ${item.name}`), `Total títulos: ${formatEuros(titlesPrice(paidTitles.length))} (precio escalonado)`, ''] : []),
      ...(chosenAddons.length ? ['Ampliaciones:', ...chosenAddons.map(item => `- ${item.name} (${item.price})`), ''] : []),
      `Grupo: ${groupName || '(sin nombre)'}`,
      `Referencia del grupo: ${groupId}`,
      `Cuenta: ${userId}`,
    ];
    return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Pro-Shop: solicitud para ${groupName || 'mi Team'}`)}&body=${encodeURIComponent(lines.join('\n'))}`;
  };

  return (
    <div className="min-h-screen bg-app transition-colors">
      <div className="max-w-lg mx-auto px-4 py-6">
        <TopBar left={<NavigationButton destination="back" onClick={onBack} />} center={messagesButton} />

        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-ink">Pro-Shop</h1>
          <p className="text-sm text-ink-3">{groupName ? `Ampliaciones para ${groupName}` : 'Ampliaciones para tu Team'}</p>
        </div>

        {!groupId ? (
          <div className="rounded-2xl border border-line bg-card p-5 text-center text-sm text-ink-3 shadow-card">
            Abre uno de tus grupos para ver y solicitar sus ampliaciones.
          </div>
        ) : (
          <div className="space-y-6">
            <section aria-labelledby="pack-gamificacion" className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="pack-gamificacion" className="text-lg font-bold text-ink">Pack de Gamificación</h2>
                <span className="text-xs text-ink-3">Precio escalonado</span>
              </div>
              <p className="text-xs text-ink-3">Títulos y estadísticas divertidas para tu grupo. 1,99 € el primero y 1 € más por cada título adicional.</p>
              <div className="rounded-2xl border border-line bg-card shadow-card">
                {titles.map((item, index) => (
                  <ShopRow
                    key={item.id}
                    item={item}
                    first={index === 0}
                    checked={selectedTitles.has(item.id)}
                    price={item.free ? 'Incluido' : '1,99 €*'}
                    onToggle={() => toggle(selectedTitles, setSelectedTitles, item.id)}
                  />
                ))}
              </div>
              <p className="text-xs text-ink-3">* Precio del primer título; el total baja por título al elegir varios.</p>
            </section>

            <section aria-labelledby="amplia-team" className="space-y-2">
              <h2 id="amplia-team" className="text-lg font-bold text-ink">Amplía tu Team</h2>
              <p className="text-xs text-ink-3">Complementos para adaptar tu plan Team o Premium. Sin permanencia.</p>
              <div className="rounded-2xl border border-line bg-card shadow-card">
                {addons.map((item, index) => (
                  <ShopRow
                    key={item.id}
                    item={item}
                    first={index === 0}
                    checked={selectedAddons.has(item.id)}
                    price={item.price}
                    note={item.note}
                    onToggle={() => toggle(selectedAddons, setSelectedAddons, item.id)}
                  />
                ))}
              </div>
            </section>

            <section aria-label="Resumen" className="rounded-2xl border border-line bg-card p-4 shadow-card space-y-3">
              <div className="flex items-center gap-3">
                <ShoppingCart size={20} className="shrink-0 text-accent-ink" aria-hidden="true" />
                <div className="min-w-0 flex-1 text-sm">
                  {hasRequest ? (
                    <>
                      {paidTitles.length > 0 && <p className="text-ink"><span className="font-semibold">{paidTitles.length} {paidTitles.length === 1 ? 'título' : 'títulos'}</span> · {formatEuros(titlesPrice(paidTitles.length))}</p>}
                      {chosenAddons.map(item => <p key={item.id} className="text-ink"><span className="font-semibold">{item.name}</span> · {item.price}</p>)}
                    </>
                  ) : (
                    <p className="text-ink-3">"No paso de Rojas" va incluido. Selecciona títulos o ampliaciones para solicitarlos.</p>
                  )}
                </div>
              </div>
              {hasRequest ? (
                <a
                  href={requestHref()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-semibold text-on-accent transition-colors hover:bg-accent-hover"
                >
                  <Mail size={18} aria-hidden="true" />
                  Solicitar
                </a>
              ) : (
                <WriteButton disabled className="w-full rounded-xl bg-neutral px-4 py-3 font-semibold text-ink-3 disabled:cursor-not-allowed">
                  Solicitar
                </WriteButton>
              )}
              <p className="text-xs text-ink-3">De momento la solicitud se envía por email a {CONTACT_EMAIL} y la activamos en tu grupo. Pronto podrás pagarla desde la app.</p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

const ShopRow: React.FC<{
  item: ShopItem;
  first: boolean;
  checked: boolean;
  price: string;
  note?: string;
  onToggle: () => void;
}> = ({ item, first, checked, price, note, onToggle }) => {
  const locked = item.free || item.comingSoon;
  const inputId = `shop-${item.id}`;
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${first ? '' : 'border-t border-line'} ${item.comingSoon ? 'opacity-70' : ''}`}>
      <input
        id={inputId}
        type="checkbox"
        checked={checked && !item.comingSoon}
        disabled={locked}
        onChange={onToggle}
        className="h-5 w-5 shrink-0 accent-[var(--accent)] disabled:cursor-not-allowed"
      />
      <item.icon size={18} className="shrink-0 text-accent-ink" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <label htmlFor={inputId} className={`truncate font-semibold text-ink ${locked ? '' : 'cursor-pointer'}`}>{item.name}</label>
          <InfoTrigger title={item.name} text={item.info} />
        </div>
        {note && <p className="text-xs text-ink-3">{note}</p>}
      </div>
      {item.comingSoon ? (
        <span className="shrink-0 rounded-full bg-card-2 px-2 py-1 text-[10px] font-bold uppercase text-ink-3">Próximamente</span>
      ) : item.free ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2 py-1 text-xs font-semibold text-accent-ink"><Check size={13} aria-hidden="true" />{price}</span>
      ) : (
        <span className="shrink-0 text-sm font-bold text-ink">{price}</span>
      )}
    </div>
  );
};

// Botón (i): muestra la explicación al pulsarlo; se cierra al pulsar fuera o con Escape.
const InfoTrigger: React.FC<{ title: string; text: string }> = ({ title, text }) => {
  const [show, setShow] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!show) return;
    const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setShow(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setShow(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [show]);
  return (
    <span ref={rootRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={() => setShow(current => !current)}
        aria-expanded={show}
        aria-label={`Qué es ${title}`}
        className="rounded-full p-0.5 text-ink-3 hover:text-ink"
      >
        <Info size={15} />
      </button>
      {show && (
        <span role="tooltip" className="absolute left-1/2 top-6 z-50 w-64 max-w-[80vw] -translate-x-1/2 rounded-xl border border-line bg-card p-3 text-xs leading-5 text-ink shadow-2xl">
          {text}
        </span>
      )}
    </span>
  );
};
