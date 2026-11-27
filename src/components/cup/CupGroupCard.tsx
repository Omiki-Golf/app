import React, { useEffect, useState } from 'react';
import { ChevronRight, Swords, Trophy } from 'lucide-react';
import { cupService, cupStatusLabel, type CupOverview } from '../../services/cupService';

/**
 * «Estadísticas · Copa Match Play»: bajo las Estadísticas del grupo. Acceso a la edición abierta
 * y a las ediciones cerradas en modo consulta. No aparece si el grupo nunca ha tenido Copa.
 */
export function CupGroupCard({ groupId, onOpen }: { groupId: string; onOpen: (editionId: string) => void }) {
  const [overview, setOverview] = useState<CupOverview | null>(null);
  useEffect(() => {
    let cancelled = false;
    cupService.getOverview(groupId).then(data => { if (!cancelled) setOverview(data); }).catch(() => { if (!cancelled) setOverview(null); });
    return () => { cancelled = true; };
  }, [groupId]);

  if (!overview || (!overview.open && overview.editions.length === 0)) return null;
  return (
    <section aria-labelledby="cup-stats" className="overflow-hidden rounded-lg border-2 border-amber-400 bg-slate-900 text-slate-100 shadow-card">
      <div className="space-y-3 p-5">
        <h2 id="cup-stats" className="flex items-center gap-2 text-xl font-bold"><Swords size={22} className="text-amber-400" aria-hidden="true" />Estadísticas · Copa Match Play</h2>
        {overview.open && (
          <button type="button" onClick={() => onOpen(overview.open!.id)} className="flex w-full items-center justify-between gap-2 rounded-xl bg-amber-400 px-4 py-3 text-left font-semibold text-slate-950">
            <span className="min-w-0">
              <span className="block truncate">{overview.open.name}</span>
              <span className="block text-xs font-normal">{cupStatusLabel[overview.open.status]}{overview.open.stage ? ` · ${overview.open.stage}` : ''}</span>
            </span>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        )}
        {overview.editions.length > 0 && (
          <ul className="divide-y divide-slate-700 rounded-xl border border-slate-700">
            {overview.editions.map(edition => (
              <li key={edition.id}>
                <button type="button" onClick={() => onOpen(edition.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-800">
                  <Trophy size={16} className={edition.status === 'finished' ? 'shrink-0 text-amber-400' : 'shrink-0 text-slate-500'} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{edition.name}</span>
                    <span className="block text-xs text-slate-400">{edition.status === 'finished' ? `Campeón: ${edition.champion ?? '—'}` : 'Cancelada'}</span>
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-slate-500" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-slate-400">Las ediciones cerradas se consultan en modo lectura. La Copa no cambia hándicaps ni clasificaciones del grupo.</p>
      </div>
    </section>
  );
}
