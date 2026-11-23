import React, { useState, useEffect } from 'react';
import { Check, Save } from 'lucide-react';
import { groupSettingsService, HandicapVariationMode, GAMIFICATION_UPDATED_EVENT } from '../services/groupSettingsService';
import { gamificationProduct } from '../data/gamification';
import { GamificationBadge } from './GamificationBadge';
import { supabase } from '../services/supabaseClient';

interface GroupSettingsPanelProps {
  groupId: string;
  /** Solo el creador puede cambiar el nombre del grupo. */
  isOwner?: boolean;
  groupName?: string;
  onRenamed?: (name: string) => void;
}

const MAX_GROUP_NAME = 60;

export function GroupSettingsPanel({ groupId, isOwner = false, groupName = '', onRenamed }: GroupSettingsPanelProps) {
  const [name, setName] = useState(groupName);
  const [renaming, setRenaming] = useState(false);
  const [renameMessage, setRenameMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setName(groupName); }, [groupName]);

  const handleRename = async () => {
    const clean = name.trim();
    if (!clean) { setRenameMessage({ ok: false, text: 'El nombre del grupo es obligatorio.' }); return; }
    setRenaming(true);
    setRenameMessage(null);
    const { data, error } = await supabase.rpc('rename_owned_group', { p_group: groupId, p_name: clean });
    setRenaming(false);
    if (error) {
      console.error('Error renombrando el grupo:', error);
      setRenameMessage({ ok: false, text: error.message || 'No se ha podido cambiar el nombre.' });
      return;
    }
    const saved = typeof data === 'string' ? data : clean;
    setName(saved);
    onRenamed?.(saved);
    setRenameMessage({ ok: true, text: 'Nombre actualizado' });
    setTimeout(() => setRenameMessage(null), 3000);
  };

  const [minRounds, setMinRounds] = useState<number>(0);
  const [hcpVariation, setHcpVariation] = useState<HandicapVariationMode>('mitad');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [gamification, setGamification] = useState<Array<{ product_id: string; enabled: boolean }>>([]);
  const [gamificationError, setGamificationError] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [addons, setAddons] = useState<{ maxPlayers: number; additionalGroup: boolean; simultaneousSeason: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([groupSettingsService.getGroupSettings(groupId), groupSettingsService.getGamification(groupId), groupSettingsService.getAddons(groupId)]).then(([settings, products, activeAddons]) => {
      if (!cancelled) {
        setMinRounds(settings.min_rounds_for_awards);
        setHcpVariation(settings.handicap_variation_mode);
        setGamification(products ?? []);
        setGamificationError(products === null);
        setAddons(activeAddons);
        setLoading(false);
      }
    });
    // Al guardar en el Pro-Shop, el desplegable muestra al momento lo contratado.
    const reloadGamification = (event: Event) => {
      const detail = (event as CustomEvent<{ groupId?: string }>).detail;
      if (detail?.groupId && detail.groupId !== groupId) return;
      void Promise.all([groupSettingsService.getGamification(groupId), groupSettingsService.getAddons(groupId)]).then(([products, activeAddons]) => {
        if (cancelled) return;
        if (products) {
          setGamification(products);
          setGamificationError(false);
        }
        setAddons(activeAddons);
      });
    };
    window.addEventListener(GAMIFICATION_UPDATED_EVENT, reloadGamification);
    return () => {
      cancelled = true;
      window.removeEventListener(GAMIFICATION_UPDATED_EVENT, reloadGamification);
    };
  }, [groupId]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError('');
    try {
      await groupSettingsService.saveGroupSettings(groupId, {
        min_rounds_for_awards: minRounds,
        handicap_variation_mode: hcpVariation,
      });
      await groupSettingsService.saveGamification(groupId, gamification);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Error guardando la configuración del grupo:', error);
      setSaveError('No se ha podido guardar la configuración. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-2 text-center text-xs text-ink-3">
        Cargando opciones...
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-1">
      {isOwner && (
        <div>
          <label htmlFor={`group-name-${groupId}`} className="block text-sm font-semibold text-ink mb-1">
            Nombre del grupo
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`group-name-${groupId}`}
              type="text"
              value={name}
              maxLength={MAX_GROUP_NAME}
              onChange={(e) => { setName(e.target.value); setRenameMessage(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim() && name.trim() !== groupName) void handleRename(); }}
              className="min-w-0 flex-1 bg-card-2 border border-line rounded-lg px-3 py-2 text-ink text-base focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              type="button"
              disabled={renaming || !name.trim() || name.trim() === groupName}
              onClick={handleRename}
              className="shrink-0 inline-flex items-center gap-1 bg-accent text-on-accent px-3 py-2 rounded-lg hover:bg-accent-hover transition-colors font-semibold text-sm disabled:opacity-50"
            >
              <Save size={16} />
              {renaming ? 'Guardando...' : 'Cambiar'}
            </button>
          </div>
          {renameMessage && (
            <p role={renameMessage.ok ? 'status' : 'alert'} className={`mt-1 text-xs font-semibold ${renameMessage.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600'}`}>
              {renameMessage.text}
            </p>
          )}
        </div>
      )}

      {/* Partidas mínimas */}
      <div>
        <label className="block text-sm font-semibold text-ink mb-1">
          Partidas mínimas para premios
        </label>
        <p className="text-xs text-ink-3 mb-2">
          Número mínimo de partidas que ha de haber jugado un jugador para contar para los premios tanto buenos como malos y tanto individuales como grupales.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min="0"
            step="1"
            value={minRounds === 0 ? '' : minRounds}
            placeholder="0"
            onChange={(e) => {
              const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
              setMinRounds(Number.isNaN(val) ? 0 : Math.max(0, val));
            }}
            className="w-28 bg-card-2 border border-line rounded-lg px-3 py-2 text-ink text-base font-bold text-center focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <span className="text-xs text-ink-3">
            {minRounds === 0 ? 'Sin mínimo (todos participan)' : `${minRounds} ${minRounds === 1 ? 'partida' : 'partidas'}`}
          </span>
        </div>
      </div>

      {/* Variación de HCP */}
      <div>
        <label className="block text-sm font-semibold text-ink mb-1">
          Variación de HCP
        </label>
        <p className="text-xs text-ink-3 mb-2">
          A cuántos jugadores se les baja el hándicap y a cuántos se les sube para la siguiente partida.
        </p>
        <div className="space-y-2">
          <label className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${hcpVariation === 'primero_ultimo' ? 'border-accent bg-accent-soft/20 ring-1 ring-accent' : 'border-line bg-card-2 hover:bg-neutral-hover'}`}>
            <input
              type="radio"
              name={`hcp_variation_${groupId}`}
              value="primero_ultimo"
              checked={hcpVariation === 'primero_ultimo'}
              onChange={() => setHcpVariation('primero_ultimo')}
              className="mt-1 text-accent focus:ring-accent"
            />
            <div className="text-xs">
              <span className="font-bold text-ink block text-sm">Primero baja, último sube</span>
              <span className="text-ink-3">Baja 1 punto al ganador y sube 1 punto al último clasificado. Los demás no cambian.</span>
            </div>
          </label>

          <label className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${hcpVariation === 'mitad' ? 'border-accent bg-accent-soft/20 ring-1 ring-accent' : 'border-line bg-card-2 hover:bg-neutral-hover'}`}>
            <input
              type="radio"
              name={`hcp_variation_${groupId}`}
              value="mitad"
              checked={hcpVariation === 'mitad'}
              onChange={() => setHcpVariation('mitad')}
              className="mt-1 text-accent focus:ring-accent"
            />
            <div className="text-xs">
              <span className="font-bold text-ink block text-sm">Mitad baja, mitad sube</span>
              <span className="text-ink-3">Si son impares, el de enmedio no cambia.</span>
            </div>
          </label>
        </div>
      </div>

      {/* Botón Guardar */}
      <div className="border-t border-line pt-4">
        <h3 className="text-sm font-bold text-ink">Gamificación</h3>
        <p className="mb-2 text-xs text-ink-3">Activa qué títulos contratados se pueden marcar en la tarjeta de puntuación.</p>
        <div className="space-y-2">
          {gamification.map(item => {
            const product = gamificationProduct(item.product_id);
            if (!product) return null;
            const inputId = `gamification-${groupId}-${item.product_id}`;
            return <label key={item.product_id} htmlFor={inputId} className="flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-card-2 px-3 py-2 text-sm text-ink">
              <GamificationBadge productId={item.product_id} size={24} />
              <span className="min-w-0 flex-1 truncate">{product.name}</span>
              <input id={inputId} type="checkbox" checked={item.enabled} onChange={() => setGamification(current => current.map(row => row.product_id === item.product_id ? { ...row, enabled: !row.enabled } : row))} className="h-5 w-5 shrink-0 accent-[var(--accent)]" />
            </label>;
          })}
          {gamificationError && <p className="text-xs text-red-600">No se han podido cargar los títulos del grupo.</p>}
          {!gamificationError && gamification.length === 0 && <p className="text-xs text-ink-3">Activa títulos desde el Pro-Shop para que aparezcan aquí.</p>}
        </div>
      </div>

      <div className="border-t border-line pt-4">
        <h3 className="text-sm font-bold text-ink">Ampliaciones del Pro-Shop</h3>
        <p className="mb-2 text-xs text-ink-3">Se aplican automáticamente al activarlas para este grupo.</p>
        <div className="grid gap-2 text-sm">
          <div className="flex items-center justify-between rounded-lg border border-line bg-card-2 px-3 py-2"><span>Plantilla</span><strong>{addons?.maxPlayers ?? 20} jugadores</strong></div>
          <div className="flex items-center justify-between rounded-lg border border-line bg-card-2 px-3 py-2"><span>Grupo adicional</span><strong>{addons?.additionalGroup ? 'Activo' : 'No activo'}</strong></div>
          <div className="flex items-center justify-between rounded-lg border border-line bg-card-2 px-3 py-2"><span>Temporada simultánea</span><strong>{addons?.simultaneousSeason ? 'Activa' : 'No activa'}</strong></div>
        </div>
      </div>

      <div className="pt-2 flex items-center justify-between border-t border-line">
        <div>
          {saveError && <span role="alert" className="text-xs font-semibold text-red-600">{saveError}</span>}
          {saved && (
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 animate-fade-in">
              <Check size={16} /> Configuración guardada
            </span>
          )}
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="inline-flex items-center gap-2 bg-accent text-on-accent px-4 py-2 rounded-lg hover:bg-accent-hover transition-colors font-semibold text-sm disabled:opacity-50"
        >
          <Save size={16} />
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
