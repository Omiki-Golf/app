import { WriteButton } from '../context/ReadOnlyContext';
import { NavigationButton } from './NavigationButton';
import { TopBar } from './TopBar';
import React, { useEffect, useRef, useState } from 'react';
import { Check, Info, Save, ShoppingCart, Swords, UserPlus, Users, type LucideIcon } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { notifyGamificationUpdated } from '../services/groupSettingsService';
import { gamificationProduct } from '../data/gamification';
import { GamificationBadge } from './GamificationBadge';
import { useTranslation } from 'react-i18next';
import { CurrencySelector, useDisplayCurrency } from './CurrencySelector';
import { formatDisplayPrice } from '../utils/currency';
import { useSubscription } from '../hooks/useSubscription';
import { MAX_ADDITIONAL_GROUPS } from '../utils/groupCapacity';
import { additionalGroupDate, loadAdditionalGroupSlots, setAdditionalGroupRenewal, type AdditionalGroupSlot } from '../services/additionalGroups';
import { CUP_PRICE, CUP_TITLE, cupService, cupStatusLabel, type CupOverview } from '../services/cupService';
import { getErrorMessage } from '../utils/errorMessage';

interface ProShopProps {
  groupId: string | null;
  groupName?: string;
  userId: string;
  onBack: () => void;
  onPurchaseComplete?: () => void;
  /** Abre Planes con Team marcado (oferta de pasar de la prueba a Team completo). */
  onUpgradeTeam?: () => void;
  messagesButton?: React.ReactNode;
  /** Abre la Copa Match Play de un grupo (tras contratarla o desde su estado). */
  onOpenCup?: (groupId: string, editionId: string) => void;
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
  { id: 'grupo-adicional', name: 'Grupo Adicional', icon: Users, price: 24.99, note: 'Hasta 2 grupos más', info: '¿Tienes varios grupos? Amigos del club, compañeros del trabajo, la familia. Cada uno con su propio ranking y jugadores independientes.' },
  { id: 'ampliacion-plantilla', name: 'Ampliación de Plantilla', icon: UserPlus, price: 19.99, note: '+12 jugadores sobre el base', info: 'Pasa de 20 a 32 jugadores registrados, con participación máxima de 16 a 24 en cada jornada.' },
];

// Precio escalonado de la web: 1,99 € el primer título de pago y 1 € más por cada uno adicional.
const titlesPrice = (paidCount: number) => (paidCount === 0 ? 0 : 1.99 + (paidCount - 1));
type OwnedGroup = { id: string; name: string; weekend: boolean; premium: boolean };

export const ProShop: React.FC<ProShopProps> = ({ groupId: initialGroupId, groupName: initialGroupName, userId, onBack, messagesButton, onUpgradeTeam, onOpenCup }) => {
  // Títulos y ampliaciones se contratan para el grupo elegido (Weekend incluido).
  // Grupo Adicional es de la cuenta. Lo ya pagado aparece marcado y no se puede retirar.
  const [ownedGroups, setOwnedGroups] = useState<OwnedGroup[]>([]);
  const [groupId, setGroupId] = useState<string | null>(initialGroupId);
  const groupName = ownedGroups.find(group => group.id === groupId)?.name ?? initialGroupName;
  const planGroups = ownedGroups.filter(group => !group.weekend);
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
  // Lo ya pagado para el grupo elegido y lo que se va a contratar ahora.
  const [ownedTitles, setOwnedTitles] = useState<Set<string>>(new Set());
  const [ownedAddons, setOwnedAddons] = useState<Set<string>>(new Set());
  const [newTitles, setNewTitles] = useState<Set<string>>(new Set());
  const [newAddons, setNewAddons] = useState<Set<string>>(new Set());
  // Grupos Adicionales ya comprados por la cuenta (máximo 2) y si se compra otro ahora.
  const [additionalOwned, setAdditionalOwned] = useState(0);
  // Grupos Adicionales vigentes: cada uno con su grupo, su vencimiento anual y si se renueva.
  const [additionalSlots, setAdditionalSlots] = useState<AdditionalGroupSlot[]>([]);
  const [renewalBusy, setRenewalBusy] = useState<string | null>(null);
  const [renewalError, setRenewalError] = useState('');
  const [newAdditional, setNewAdditional] = useState(false);
  const [reload, setReload] = useState(0);
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

  // Grupos Adicionales de la cuenta: se anclan a sus grupos Team/Premium.
  useEffect(() => {
    const ids = planGroups.map(group => group.id);
    let cancelled = false;
    void loadAdditionalGroupSlots(userId)
      .then(slots => { if (!cancelled) { setAdditionalSlots(slots); setAdditionalOwned(Math.min(MAX_ADDITIONAL_GROUPS, slots.length)); } })
      .catch(() => {
        // Sin la tabla de Grupos Adicionales anuales: se cuentan las compras como antes.
        if (cancelled) return;
        setAdditionalSlots([]);
        if (ids.length === 0) { setAdditionalOwned(0); return; }
        void supabase.from('pro_shop_purchases').select('id').in('group_id', ids).eq('product_type', 'grupo-adicional').eq('status', 'completed')
          .then(({ data, error }) => { if (!cancelled && !error) setAdditionalOwned(Math.min(MAX_ADDITIONAL_GROUPS, (data || []).length)); });
      });
    return () => { cancelled = true; };
    // planGroups se recalcula en cada render; basta con los grupos cargados.
  }, [ownedGroups, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  // Títulos y ampliaciones ya pagados del grupo elegido.
  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    setNewTitles(new Set()); setNewAddons(new Set());
    void Promise.all([
      supabase.from('group_gamification').select('product_id').eq('group_id', groupId).eq('purchased', true),
      supabase.from('pro_shop_purchases').select('product_type').eq('group_id', groupId).eq('status', 'completed').in('product_type', ['ampliacion-plantilla', 'temporada-simultanea']),
    ]).then(([gamification, purchases]) => {
      if (cancelled) return;
      if (!gamification.error) setOwnedTitles(new Set((gamification.data || []).map(row => row.product_id).filter(id => id !== 'no-paso-rojas')));
      if (!purchases.error) setOwnedAddons(new Set((purchases.data || []).map(row => row.product_type)));
    });
    return () => { cancelled = true; };
  }, [groupId, reload]);

  const toggle = (set: Set<string>, setter: (next: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
    setSaved(false);
  };

  // Precio escalonado sobre todos los títulos del grupo: solo se paga la diferencia.
  const newTitleItems = titles.filter(item => newTitles.has(item.id));
  const newTitlesPrice = titlesPrice(ownedTitles.size + newTitleItems.length) - titlesPrice(ownedTitles.size);
  const newAddonItems = addons.filter(item => item.id === 'grupo-adicional' ? newAdditional : newAddons.has(item.id));
  const hasRequest = newTitleItems.length > 0 || newAddonItems.length > 0;
  const additionalFull = additionalOwned >= MAX_ADDITIONAL_GROUPS;
  const canBuyAdditionalGroup = hasPaidTeamPlan && planGroups.length > 0 && !additionalFull;
  // Prueba Team: solo títulos. Las ampliaciones de un grupo Team piden Team completo; los Weekend no cambian.
  const selectedIsWeekend = Boolean(ownedGroups.find(group => group.id === groupId)?.weekend);
  const groupAddonsLocked = !hasPaidTeamPlan && !selectedIsWeekend;
  const showTeamUpgrade = isTeamTrial && !hasPaidTeamPlan;
  const additionalNote = additionalFull
    ? 'Ya tienes tus 3 grupos: el incluido y 2 adicionales'
    : !hasPaidTeamPlan ? (isTeamTrial ? 'Disponible con Team completo' : 'Requiere un plan Team o Premium')
    : planGroups.length === 0 ? 'Crea primero el grupo incluido en tu plan'
    : `Tienes ${additionalOwned} de ${MAX_ADDITIONAL_GROUPS} · contrata otro grupo`;

  const activateForTesting = async () => {
    if (!groupId || !hasRequest) return;
    setSaving(true); setSaved(false); setSaveError('');
    try {
      if (newTitleItems.length > 0) {
        const { error } = await supabase.rpc('activate_group_gamification', { p_group: groupId, p_product_ids: [...ownedTitles, ...newTitles] });
        if (error) throw error;
        notifyGamificationUpdated(groupId);
      }
      if (newAddons.size > 0) {
        const { error } = await supabase.rpc('activate_group_addons_for_testing', { p_group: groupId, p_product_ids: [...ownedAddons, ...newAddons] });
        if (error) throw error;
      }
      if (newAdditional) {
        const { error } = await supabase.rpc('add_additional_group_for_testing');
        if (error) throw error;
      }
      setNewAdditional(false);
      setReload(value => value + 1);
      setSaved(true);
    } catch (error) {
      console.error('Error activating Pro-Shop products:', error);
      setSaveError(error instanceof Error && error.message ? error.message : 'No se ha podido contratar la selección. Inténtalo de nuevo.');
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
                <p className="text-xs text-ink-3">La gamificación y las ampliaciones se contratan para cada grupo. Grupo Adicional es para tu cuenta.</p>
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
              <p className="text-xs text-ink-3">Para {groupName || 'este grupo'}. 1,99 € el primer título y 1 € más por cada uno adicional, IVA incluido. Lo ya contratado queda marcado.</p>
              <div className="rounded-2xl border border-line bg-card shadow-card">
                {titles.map((item, index) => (
                  <ShopRow
                    key={item.id}
                    item={item}
                    first={index === 0}
                    checked={item.free || ownedTitles.has(item.id) || newTitles.has(item.id)}
                    purchased={ownedTitles.has(item.id)}
                    price={item.free ? 'Incluido' : `${money(1.99)}*`}
                    vatLabel={t('plans.vatShort')}
                    onToggle={() => toggle(newTitles, setNewTitles, item.id)}
                  />
                ))}
              </div>
              <p className="text-xs text-ink-3">* Precio del primer título; el total baja por título al elegir varios. Todos los precios llevan el IVA incluido.</p>
            </section>

            <section aria-labelledby="amplia-team" className="space-y-2">
              <h2 id="amplia-team" className="text-lg font-bold text-ink">Amplía tu Team</h2>
              <p className="text-xs text-ink-3">Ampliación de Plantilla es para {groupName || 'este grupo'}; Grupo Adicional, para tu cuenta.</p>
              <div className="rounded-2xl border border-line bg-card shadow-card">
                {addons.map((item, index) => {
                  const isAdditional = item.id === 'grupo-adicional';
                  return <ShopRow
                    key={item.id}
                    item={item}
                    first={index === 0}
                    checked={isAdditional ? newAdditional : ownedAddons.has(item.id) || newAddons.has(item.id)}
                    purchased={!isAdditional && ownedAddons.has(item.id)}
                    price={`${money(item.price)}${item.id === 'ampliacion-plantilla' ? '' : ' / año'}`}
                    vatLabel={t('plans.vatShort')}
                    note={isAdditional ? additionalNote : groupAddonsLocked && !ownedAddons.has(item.id) ? (isTeamTrial ? 'Disponible con Team completo' : 'Requiere un plan Team o Premium') : item.note}
                    onToggle={() => {
                      if (isAdditional) { setNewAdditional(current => !current); setSaved(false); }
                      else toggle(newAddons, setNewAddons, item.id);
                    }}
                    disabled={isAdditional ? !canBuyAdditionalGroup : groupAddonsLocked}
                  />;
                })}
              </div>
              {additionalSlots.length > 0 && (
                <div className="rounded-2xl border border-line bg-card p-3 shadow-card">
                  <p className="text-sm font-semibold text-ink">Tus Grupos Adicionales</p>
                  <p className="text-xs text-ink-3">Cada uno se renueva cada año en su fecha. Si no lo renuevas, su grupo se archiva ese día y queda solo para consulta.</p>
                  <ul className="mt-2 space-y-2">
                    {additionalSlots.map(slot => {
                      const name = ownedGroups.find(group => group.id === slot.group_id)?.name;
                      const date = additionalGroupDate(slot.expires_at);
                      return <li key={slot.id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-card-2 px-3 py-2">
                        <div className="min-w-0 text-sm">
                          <p className="truncate font-semibold text-ink">{name ?? 'Hueco libre'}</p>
                          <p className={`text-xs ${slot.renew ? 'text-ink-3' : 'text-red-600'}`}>{slot.renew ? `Se renueva el ${date}` : name ? `No se renovará: se archivará el ${date}` : `No se renovará: vence el ${date}`}</p>
                        </div>
                        <WriteButton
                          type="button"
                          disabled={renewalBusy === slot.id}
                          onClick={async () => {
                            setRenewalBusy(slot.id); setRenewalError('');
                            try { await setAdditionalGroupRenewal(slot.id, !slot.renew); setReload(value => value + 1); }
                            catch (cause) { setRenewalError(cause instanceof Error && cause.message ? cause.message : 'No se ha podido guardar.'); }
                            finally { setRenewalBusy(null); }
                          }}
                          className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold ${slot.renew ? 'border border-red-300 text-red-600' : 'bg-accent text-on-accent'}`}
                        >{slot.renew ? 'No renovar' : 'Renovar'}</WriteButton>
                      </li>;
                    })}
                  </ul>
                  {renewalError && <p role="alert" className="mt-2 text-xs text-red-600">{renewalError}</p>}
                </div>
              )}
              {showTeamUpgrade && (
                <div role="status" className="rounded-2xl border border-accent bg-accent-soft p-4 text-center">
                  <p className="text-sm font-semibold text-ink">Estás en la prueba Team</p>
                  <p className="mt-1 text-xs text-ink-2">Pasa a Team completo para contratar Grupos Adicionales, Ampliar Plantilla y la Copa Match Play. Los títulos ya puedes contratarlos.</p>
                  {onUpgradeTeam && <button type="button" onClick={onUpgradeTeam} className="mt-3 w-full rounded-xl bg-accent px-4 py-2.5 font-semibold text-on-accent transition-colors hover:bg-accent-hover">Pasar a Team completo</button>}
                </div>
              )}
            </section>

            <CupShopCard
              groupId={groupId}
              groupName={groupName}
              eligible={hasPaidTeamPlan && !selectedIsWeekend}
              lockedNote={selectedIsWeekend ? 'Disponible para grupos Team o Premium' : isTeamTrial ? 'Disponible con Team completo' : 'Requiere un plan Team o Premium'}
              money={money}
              vatLabel={t('plans.vatIncluded')}
              onOpenCup={onOpenCup}
            />

            <section aria-label="Resumen" className="rounded-2xl border border-line bg-card p-4 shadow-card space-y-3">
              <div className="flex items-center gap-3">
                <ShoppingCart size={20} className="shrink-0 text-accent-ink" aria-hidden="true" />
                <div className="min-w-0 flex-1 text-sm">
                  {hasRequest ? (
                    <>
                      {newTitleItems.length > 0 && <p className="text-ink"><span className="font-semibold">{newTitleItems.length} {newTitleItems.length === 1 ? 'título' : 'títulos'}</span> · {money(newTitlesPrice)} {t('plans.vatIncluded')}</p>}
                      {newAddonItems.map(item => <p key={item.id} className="text-ink"><span className="font-semibold">{item.name}</span> · {money(item.price)}{item.id === 'ampliacion-plantilla' ? '' : ' / año'} {t('plans.vatIncluded')}</p>)}
                    </>
                  ) : (
                    <p className="text-ink-3">"No paso de Rojas" va incluido. Marca lo que quieras contratar para este grupo.</p>
                  )}
                </div>
              </div>
              <WriteButton
                type="button"
                disabled={saving || !hasRequest}
                onClick={() => void activateForTesting()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                {saved ? <Check size={18} aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}
                {saving ? 'Contratando…' : saved && !hasRequest ? 'Contratado' : 'Contratar selección (pruebas)'}
              </WriteButton>
              {saved && <p role="status" className="text-center text-xs font-semibold text-accent-ink">Contratado para {groupName || 'el grupo elegido'}. Ya aparece marcado y no se puede retirar.</p>}
              {saveError && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700">{saveError}</p>}
              <p className="text-xs text-ink-3">Los títulos y ampliaciones están desbloqueados para pruebas. La plantilla pasa a 32 jugadores y Grupo Adicional permite otro grupo (hasta 3 en total). La Copa Match Play se contrata aparte, edición a edición.</p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

// Temporada Simultánea · Copa Match Play: 14,99 € por edición; una abierta como máximo por grupo.
const CupShopCard: React.FC<{
  groupId: string;
  groupName?: string;
  eligible: boolean;
  lockedNote: string;
  money: (value: number) => string;
  vatLabel: string;
  onOpenCup?: (groupId: string, editionId: string) => void;
}> = ({ groupId, groupName, eligible, lockedNote, money, vatLabel, onOpenCup }) => {
  const [overview, setOverview] = useState<CupOverview | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setOverview(null); setLoadError(false); setConfirming(false); setError('');
    cupService.getOverview(groupId)
      .then(data => { if (!cancelled) setOverview(data); })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [groupId]);

  const open = overview?.open ?? null;
  const last = overview?.editions[0];
  const buy = async () => {
    setBuying(true); setError('');
    try {
      const { edition_id } = await cupService.purchase(groupId);
      setConfirming(false);
      if (onOpenCup) onOpenCup(groupId, edition_id);
      else setOverview(await cupService.getOverview(groupId));
    } catch (cause) {
      setError(getErrorMessage(cause, 'No se ha podido contratar la Copa. Inténtalo de nuevo.'));
      cupService.getOverview(groupId).then(setOverview).catch(() => undefined);
    } finally { setBuying(false); }
  };

  return (
    <section aria-labelledby="copa-match-play" className="space-y-2">
      <h2 id="copa-match-play" className="text-lg font-bold text-ink">{CUP_TITLE}</h2>
      <div className="rounded-2xl border-2 border-amber-400 bg-card p-4 shadow-card">
        <div className="flex items-start gap-3">
          <Swords size={22} className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="font-semibold text-ink">Copa Match Play</p>
              <InfoTrigger title={CUP_TITLE} text="Competición por eliminatorias 1 contra 1 en paralelo a la temporada del grupo. Sus resultados no cambian hándicaps, rankings, estadísticas ni premios del grupo. Cada compra habilita una edición." />
            </div>
            <p className="text-xs text-ink-3">Cuadro eliminatorio 1 contra 1 · {money(CUP_PRICE)} por edición, {vatLabel}</p>
          </div>
        </div>
        <div className="mt-3 space-y-2 text-sm">
          {loadError && <p className="text-xs text-ink-3">No se ha podido consultar la Copa de {groupName || 'este grupo'}. Vuelve a intentarlo más tarde.</p>}
          {!overview && !loadError && <p role="status" className="text-xs text-ink-3">Consultando la Copa…</p>}
          {overview && open && (
            <>
              <p className="rounded-xl bg-accent-soft px-3 py-2 text-xs font-semibold text-accent-ink">
                {cupStatusLabel[open.status]}{open.stage ? ` · ${open.stage}` : ''} — Finalízala para contratar la siguiente edición.
              </p>
              {onOpenCup && <button type="button" onClick={() => onOpenCup(groupId, open.id)} className="w-full rounded-xl border-2 border-amber-400 px-4 py-2 font-semibold text-ink transition-colors hover:bg-card-2">
                {open.status === 'active' || open.status === 'paused' ? 'Ir al cuadro actual' : 'Ir a la Copa'}
              </button>}
            </>
          )}
          {overview && !open && (
            <>
              {last && overview.is_owner && (
                <p className="text-xs text-ink-3">
                  Edición #{last.number} {last.status === 'finished' ? `finalizada${last.champion ? ` (Campeón: ${last.champion})` : ''}` : 'cancelada'}
                </p>
              )}
              {!eligible || !overview.is_owner ? (
                <p className="text-xs text-ink-3">{overview.is_owner ? lockedNote : 'Solo el propietario del grupo puede contratar la Copa.'}</p>
              ) : confirming ? (
                <div className="space-y-2">
                  <p className="text-xs text-ink-2">Se contratará la edición #{overview.next_number} para {groupName || 'este grupo'} por {money(CUP_PRICE)}, {vatLabel} (pago de prueba). Después se abrirá su configuración.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" disabled={buying} onClick={() => setConfirming(false)} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink-2">Cancelar</button>
                    <WriteButton type="button" disabled={buying} onClick={() => void buy()} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-60">{buying ? 'Contratando…' : 'Confirmar'}</WriteButton>
                  </div>
                </div>
              ) : (
                <WriteButton type="button" disabled={!overview.can_purchase} onClick={() => setConfirming(true)} className="w-full rounded-xl bg-accent px-4 py-2.5 font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60">
                  {last ? `Contratar edición #${overview.next_number}` : `Contratar ${CUP_TITLE}`} ({money(CUP_PRICE)})
                </WriteButton>
              )}
            </>
          )}
          {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        </div>
      </div>
    </section>
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
  /** Ya pagado para este grupo: marcado y sin poder retirarse. */
  purchased?: boolean;
  /** Etiqueta de IVA bajo el precio («IVA incl.»). */
  vatLabel?: string;
}> = ({ item, first, checked, price, note, onToggle, disabled = false, purchased = false, vatLabel }) => {
  const locked = Boolean(item.free || disabled || purchased);
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
      {item.free || purchased ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2 py-1 text-xs font-semibold text-accent-ink"><Check size={13} aria-hidden="true" />{item.free ? price : 'Contratado'}</span>
      ) : (
        <span className="shrink-0 text-right text-sm font-bold text-ink">{price}<span className="block text-[10px] font-normal text-ink-3">{vatLabel}</span></span>
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
