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
import { useSubscription } from '../hooks/useSubscription';

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
type OwnedGroup = { id: string; name: string; weekend: boolean; premium: boolean };

export const ProShop: React.FC<ProShopProps> = ({ groupId: initialGroupId, groupName: initialGroupName, userId, onBack, messagesButton }) => {
  // El selector solo afecta a las ampliaciones propias de un grupo. La gamificación y
  // Grupo Adicional tienen alcance global sobre la cuenta.
  const [ownedGroups, setOwnedGroups] = useState<OwnedGroup[]>([]);
  const [groupId, setGroupId] = useState<string | null>(initialGroupId);
  const groupName = ownedGroups.find(group => group.id === groupId)?.name ?? initialGroupName;
  const selectedGroup = ownedGroups.find(group => group.id === groupId);
  const eligibleGlobalGroups = ownedGroups.filter(group => !group.weekend);
  const { t, i18n } = useTranslation();
  const { subscription } = useSubscription(userId);
  const hasPaidTeamPlan = subscription?.status === 'active'
    && (subscription.plan_type === 'team' || subscription.plan_type === 'premium')
    && (!subscription.current_period_end || Date.parse(subscription.current_period_end) > Date.now());
  const isTeamTrial = subscription?.plan_type === 'player'
    && subscription.status === 'active'
    && Boolean(subscription.team_trial_ends_at && Date.parse(subscription.team_trial_ends_at) > Date.now());
  const currency = useDisplayCurrency();
  const money = (value: number) => formatDisplayPrice(value, currency, i18n.resolvedLanguage);
  const [selectedTitles, setSelectedTitles] = useState<Set<string>>(() => new Set(titles.filter(item => item.free).map(item => item.id)));
  const [selectedAddons, setSelectedAddons] = useState<Set<string>>(new Set());
  const [additionalGroup, setAdditionalGroup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void supabase.from('groups').select('id, name, group_code, group_type, premium_branding').eq('user_auth_id', userId).is('archived_at', null).order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled || error) return;
        const groups = (data || []).map(group => ({ id: group.id, name: group.name || group.group_code, weekend: group.group_type === 'weekend', premium: Boolean(group.premium_branding) }));
        setOwnedGroups(groups);
        setGroupId(current => current && groups.some(group => group.id === current) ? current : groups[0]?.id ?? null);
      });
    return () => { cancelled = true; };
  }, [userId]);

  // Títulos globales: se conserva la unión de lo ya contratado y, al guardar, se
  // normaliza la misma selección en todos los grupos Team/Premium (nunca Weekend).
  useEffect(() => {
    const ids = eligibleGlobalGroups.map(group => group.id);
    if (ids.length === 0) return;
    let cancelled = false;
    void Promise.all([
      supabase.from('group_gamification').select('product_id').in('group_id', ids).eq('purchased', true),
      supabase.from('pro_shop_purchases').select('id').in('group_id', ids).eq('product_type', 'grupo-adicional').eq('status', 'completed').limit(1),
    ]).then(([gamification, extra]) => {
      if (cancelled) return;
      if (!gamification.error) setSelectedTitles(new Set(['no-paso-rojas', ...(gamification.data || []).map(row => row.product_id)]));
      if (!extra.error) setAdditionalGroup((extra.data || []).length > 0);
    });
    return () => { cancelled = true; };
  }, [ownedGroups]);

  // Plantilla y Temporada Simultánea sí pertenecen al grupo seleccionado.
  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    setSaved(false);
    void supabase.from('pro_shop_purchases').select('product_type').eq('group_id', groupId).eq('status', 'completed').in('product_type', ['ampliacion-plantilla', 'temporada-simultanea'])
      .then(({ data, error }) => {
      if (cancelled) return;
      if (!error) setSelectedAddons(new Set((data || []).map(row => row.product_type)));
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
  const chosenAddons = addons.filter(item => item.id === 'grupo-adicional' ? additionalGroup : selectedAddons.has(item.id));
  const hasRequest = paidTitles.length > 0 || chosenAddons.length > 0;
  const canUseGlobalTitles = eligibleGlobalGroups.length > 0;
  const canBuyAdditionalGroup = hasPaidTeamPlan && Boolean(selectedGroup && !selectedGroup.weekend);

  const activateForTesting = async () => {
    if (!groupId) return;
    setSaving(true); setSaved(false); setSaveError('');
    try {
      if (eligibleGlobalGroups.length > 0) {
        const { error: gamificationError } = await supabase.rpc('activate_account_gamification', { p_product_ids: paidTitles.map(item => item.id) });
        if (gamificationError) throw gamificationError;
        eligibleGlobalGroups.forEach(group => notifyGamificationUpdated(group.id));
      }
      const { error: accountExtraError } = await supabase.rpc('set_additional_group_for_testing', { p_enabled: additionalGroup });
      if (accountExtraError) throw accountExtraError;
      const groupAddons = [...selectedAddons].filter(id => id !== 'grupo-adicional');
      const { error: addonsError } = await supabase.rpc('activate_group_addons_for_testing', { p_group: groupId, p_product_ids: groupAddons });
      if (addonsError) throw addonsError;
      setSaved(true);
    } catch (error) {
      console.error('Error activating group gamification:', error);
      setSaveError('No se ha podido guardar la selección. Inténtalo de nuevo.');
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
            {ownedGroups.length > 1 && (
              <section aria-labelledby="shop-group" className="space-y-2">
                <h2 id="shop-group" className="text-lg font-bold text-ink">Configurar grupo</h2>
                <p className="text-xs text-ink-3">La plantilla y las temporadas se configuran por grupo. La gamificación y Grupo Adicional se aplican automáticamente a tu cuenta.</p>
                <div className="flex flex-wrap gap-2">
                  {ownedGroups.map(group => (
                    <button
                      key={group.id}
                      type="button"
                      aria-pressed={group.id === groupId}
                      onClick={() => setGroupId(group.id)}
                      className={`rounded-full border-2 px-4 py-1.5 text-sm font-semibold transition-colors ${group.id === groupId
                        ? (group.weekend ? 'border-orange-700 bg-orange-700 text-white' : group.premium ? 'border-pink-600 bg-pink-500 text-slate-950' : 'border-lime-500 bg-lime-400 text-slate-950')
                        : (group.weekend ? 'border-orange-600 bg-card text-orange-500' : group.premium ? 'border-pink-500 bg-card text-pink-500' : 'border-lime-400 bg-card text-lime-500')}`}
                    >
                      {group.name}{group.weekend ? ' · Weekend' : ''}
                    </button>
                  ))}
                </div>
              </section>
            )}
            <section aria-labelledby="pack-gamificacion" className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="pack-gamificacion" className="text-lg font-bold text-ink">Pack de Gamificación</h2>
                <span className="text-xs text-ink-3">Precio escalonado</span>
              </div>
              <p className="text-xs text-ink-3">Una sola selección para todos tus grupos Team y Premium. Los Weekend quedan fuera. 1,99 € el primero y 1 € más por cada título adicional.</p>
              <div className="rounded-2xl border border-line bg-card shadow-card">
                {titles.map((item, index) => (
                  <ShopRow
                    key={item.id}
                    item={item}
                    first={index === 0}
                    checked={selectedTitles.has(item.id)}
                    price={item.free ? 'Incluido' : `${money(1.99)}*`}
                    onToggle={() => toggle(selectedTitles, setSelectedTitles, item.id)}
                    disabled={!item.free && !canUseGlobalTitles}
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
                    checked={item.id === 'grupo-adicional' ? additionalGroup : selectedAddons.has(item.id)}
                    price={`${money(item.price)} / año`}
                    note={item.id === 'grupo-adicional' && !canBuyAdditionalGroup
                      ? (selectedGroup?.weekend ? 'Weekend solo permite un grupo temporal. Selecciona un Team o Premium.' : isTeamTrial ? 'Hazte Team para crear un grupo extra' : 'Requiere un plan Team o Premium')
                      : item.note}
                    onToggle={() => {
                      if (item.id === 'grupo-adicional') {
                        setAdditionalGroup(current => !current);
                        setSaved(false);
                      } else toggle(selectedAddons, setSelectedAddons, item.id);
                    }}
                    disabled={item.id === 'grupo-adicional' && !canBuyAdditionalGroup}
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
              {saved && <p role="status" className="text-center text-xs font-semibold text-accent-ink">Gamificación guardada para todos tus Team y Premium; ampliaciones propias guardadas en {groupName || 'el grupo elegido'}.</p>}
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
  disabled?: boolean;
}> = ({ item, first, checked, price, note, onToggle, disabled = false }) => {
  const locked = Boolean(item.free || disabled);
  const inputId = `shop-${item.id}`;
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${first ? '' : 'border-t border-line'} ${disabled ? 'opacity-55' : ''}`}>
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
