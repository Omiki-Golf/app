import { WriteButton } from '../context/ReadOnlyContext';
import { NavigationButton } from './NavigationButton';
import { TopBar } from './TopBar';
import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, Info, Save, ShoppingCart, UserPlus, Users, type LucideIcon } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { notifyGamificationUpdated } from '../services/groupSettingsService';
import { gamificationProduct } from '../data/gamification';
import { GamificationBadge } from './GamificationBadge';
import { useTranslation } from 'react-i18next';
import { CurrencySelector, useDisplayCurrency } from './CurrencySelector';
import { formatDisplayPrice } from '../utils/currency';

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
}

interface Addon extends ShopItem {
  price: number;
  note: string;
}

// Mismo catálogo que la web (OmikiWEB: GamificationPack y TeamAddons).
// Icono y ficha de cada título salen de data/gamification (los mismos que en la tarjeta).
const title = (id: string, info: string, free = false): ShopItem => {
  const product = gamificationProduct(id)!;
  return { id, name: product.name, icon: product.icon, info, free };
};
const titles: ShopItem[] = [
  title('no-paso-rojas', 'El jugador que no pasa de rojas (bolas de damas) en la salida paga una cerveza al resto de su partida. La tradición más sagrada del golf entre amigos, ahora digitalizada.', true),
  title('spanish-hand', 'Birdie conseguido desde fuera del green. El título más patrio para los que embocan de lejos.'),
  title('buceador', 'El jugador con más bolas enviadas al agua durante la temporada. Un clásico entre los amigos.'),
  title('minero', 'Rey indiscutible de los bunkers. El que más veces termina jugando desde la arena.'),
  title('lumberjack', 'El jugador que más árboles ha golpeado durante el año. Leñador honorario del grupo.'),
  title('maestro-obstaculos', 'El que más veces se ha salvado de un obstáculo imposible y ha salvado el par o mejor.'),
  title('fenomeno-tee', 'Mejor drive de la jornada. Márcalo en el hoyo para incluirlo en las estadísticas.'),
  title('abrelatas', 'Más bolas perdidas en todo el año. El que más pelotas ha tenido que reponer en su bolsa.'),
  title('hada-patos', 'El que más veces ha asustado a los patos del campo. Por las risas más que por el juego.'),
];

const addons: Addon[] = [
  { id: 'grupo-adicional', name: 'Grupo Adicional', icon: Users, price: 24.99, note: '+1 grupo activo', info: '¿Tienes varios grupos? Amigos del club, compañeros del trabajo, la familia. Cada uno con su propio ranking y jugadores independientes.' },
  { id: 'ampliacion-plantilla', name: 'Ampliación de Plantilla', icon: UserPlus, price: 19.99, note: '+12 jugadores sobre el base', info: 'Pasa de 20 a 32 jugadores registrados, con participación máxima de 16 a 24 en cada jornada.' },
  { id: 'temporada-simultanea', name: 'Temporada Simultánea', icon: CalendarDays, price: 14.99, note: '2 clasificaciones paralelas', info: 'Dos clasificaciones al mismo tiempo dentro del mismo grupo. Liga anual y Match Play a la vez, o una Copa de verano paralela.' },
];

// Precio escalonado de la web: 1,99 € el primer título de pago y 1 € más por cada uno adicional.
const titlesPrice = (paidCount: number) => (paidCount === 0 ? 0 : 1.99 + (paidCount - 1));
export const ProShop: React.FC<ProShopProps> = ({ groupId, groupName, onBack, messagesButton }) => {
  const { t, i18n } = useTranslation();
  const currency = useDisplayCurrency();
  const money = (value: number) => formatDisplayPrice(value, currency, i18n.resolvedLanguage);
  const [selectedTitles, setSelectedTitles] = useState<Set<string>>(() => new Set(titles.filter(item => item.free).map(item => item.id)));
  const [selectedAddons, setSelectedAddons] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    void Promise.all([
      supabase.from('group_gamification').select('product_id').eq('group_id', groupId).eq('purchased', true),
      supabase.from('pro_shop_purchases').select('product_type').eq('group_id', groupId).eq('status', 'completed').in('product_type', addons.map(item => item.id)),
    ]).then(([gamification, purchases]) => {
      if (cancelled) return;
      if (!gamification.error) setSelectedTitles(new Set(['no-paso-rojas', ...(gamification.data || []).map(row => row.product_id)]));
      if (!purchases.error) setSelectedAddons(new Set((purchases.data || []).map(row => row.product_type)));
    });
    return () => { cancelled = true; };
  }, [groupId]);

  const toggle = (set: Set<string>, setter: (next: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
    setSaved(false);
  };

  const paidTitles = titles.filter(item => !item.free && selectedTitles.has(item.id));
  const chosenAddons = addons.filter(item => selectedAddons.has(item.id));
  const hasRequest = paidTitles.length > 0 || chosenAddons.length > 0;

  const activateForTesting = async () => {
    if (!groupId) return;
    setSaving(true); setSaved(false); setSaveError('');
    try {
      const { error } = await supabase.rpc('activate_group_gamification', { p_group: groupId, p_product_ids: paidTitles.map(item => item.id) });
      if (error) throw error;
      const { error: addonsError } = await supabase.rpc('activate_group_addons_for_testing', { p_group: groupId, p_product_ids: chosenAddons.map(item => item.id) });
      if (addonsError) throw addonsError;
      setSaved(true);
      notifyGamificationUpdated(groupId);
    } catch (error) {
      console.error('Error activating group gamification:', error);
      setSaveError('No se ha podido guardar la selección en tu grupo. Inténtalo de nuevo.');
    } finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen bg-app transition-colors">
      <div className="max-w-lg mx-auto px-4 py-6">
        <TopBar left={<NavigationButton destination="back" onClick={onBack} />} center={messagesButton} />

        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-ink">Pro-Shop</h1>
          <p className="text-sm text-ink-3">{groupName ? `Ampliaciones para ${groupName}` : 'Ampliaciones para tu Team'}</p>
        </div>
        <div className="mb-6 space-y-2">
          <CurrencySelector />
          {currency === 'GBP' && <p className="text-center text-[10px] leading-relaxed text-ink-3">{t('currency.adaptive')}</p>}
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
                    price={item.free ? 'Incluido' : `${money(1.99)}*`}
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
                    price={`${money(item.price)} / año`}
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
                      {paidTitles.length > 0 && <p className="text-ink"><span className="font-semibold">{paidTitles.length} {paidTitles.length === 1 ? 'título' : 'títulos'}</span> · {money(titlesPrice(paidTitles.length))}</p>}
                      {chosenAddons.map(item => <p key={item.id} className="text-ink"><span className="font-semibold">{item.name}</span> · {money(item.price)} / año</p>)}
                    </>
                  ) : (
                    <p className="text-ink-3">"No paso de Rojas" va incluido. Selecciona títulos o ampliaciones para solicitarlos.</p>
                  )}
                </div>
              </div>
              {/* Siempre se puede guardar: también para retirar títulos desmarcados. */}
              <WriteButton
                type="button"
                disabled={saving}
                onClick={() => void activateForTesting()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                {saved ? <Check size={18} aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}
                {saving ? 'Guardando…' : saved ? 'Selección guardada' : 'Guardar selección (pruebas)'}
              </WriteButton>
              {saved && <p role="status" className="text-center text-xs font-semibold text-accent-ink">Guardado en {groupName || 'tu grupo'}. Actívalos o desactívalos en Configuración del grupo.</p>}
              {saveError && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700">{saveError}</p>}
              <p className="text-xs text-ink-3">Los títulos y ampliaciones están desbloqueados para pruebas. La plantilla pasa a 32 jugadores, Grupo Adicional permite otro grupo activo y Temporada Simultánea habilita su configuración.</p>
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
  const locked = item.free;
  const inputId = `shop-${item.id}`;
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${first ? '' : 'border-t border-line'}`}>
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        disabled={locked}
        onChange={onToggle}
        className="h-5 w-5 shrink-0 accent-[var(--accent)] disabled:cursor-not-allowed"
      />
      {gamificationProduct(item.id)
        ? <GamificationBadge productId={item.id} size={24} />
        : <item.icon size={18} className="shrink-0 text-accent-ink" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <label htmlFor={inputId} className={`truncate font-semibold text-ink ${locked ? '' : 'cursor-pointer'}`}>{item.name}</label>
          <InfoTrigger title={item.name} text={item.info} />
        </div>
        {note && <p className="text-xs text-ink-3">{note}</p>}
      </div>
      {item.free ? (
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
        className="rounded-full p-0.5 text-ink-3 hover:text-ink transition-colors"
      >
        <Info size={15} />
      </button>
      {show && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShow(false)} />
          <span
            role="tooltip"
            className="absolute left-1/2 top-6 z-50 w-64 max-w-[80vw] -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs leading-relaxed text-slate-100 shadow-2xl backdrop-blur-sm font-normal"
          >
            {text}
          </span>
        </>
      )}
    </span>
  );
};
