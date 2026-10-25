import { useState } from 'react';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

const CONFIRMATION = 'ELIMINAR CUENTA';

interface DeletionPreview {
  is_app_admin: boolean;
  groups: Array<{ id: string; name: string; archived: boolean; members: number; admin: { user_id: string; nick: string } | null }>;
}

// "Darse de baja" al final de Mis datos de registro: explica qué se borra y qué se conserva,
// qué pasará con los grupos que ha creado y pide escribir ELIMINAR CUENTA. La baja es inmediata.
export function DeleteAccountSection({ onDeleted, onOpenGroups }: { onDeleted: () => void; onOpenGroups?: () => void }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const start = async () => {
    setOpen(true); setError(''); setConfirmation(''); setLoadingPreview(true);
    try {
      const { data, error: previewError } = await supabase.rpc('account_deletion_preview');
      if (previewError) throw previewError;
      setPreview(data as DeletionPreview);
    } catch {
      setError('No se pudo comprobar tu cuenta. Inténtalo de nuevo.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const confirmDeletion = async () => {
    if (confirmation !== CONFIRMATION || deleting) return;
    setDeleting(true); setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('delete-account', { body: { confirm: CONFIRMATION } });
      if (invokeError) {
        const context = (invokeError as { context?: Response }).context;
        const detail = context ? await context.json().catch(() => null) : null;
        throw new Error(detail?.error || 'No se pudo completar la baja. Inténtalo de nuevo.');
      }
      if (!data?.ok) throw new Error(data?.error || 'No se pudo completar la baja.');
      setOpen(false);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la baja.');
    } finally {
      setDeleting(false);
    }
  };

  const groupsWithoutAdmin = preview?.groups.filter(group => !group.admin && group.members > 0) ?? [];

  return (
    <section className="mt-7 border-t border-line pt-6" aria-labelledby="delete-account-title">
      <h2 id="delete-account-title" className="text-lg font-bold text-ink">Darse de baja</h2>
      <p className="mt-1 text-sm text-ink-3">Elimina tu cuenta y tus datos personales. Tus resultados se quedan en los grupos para no alterar sus clasificaciones.</p>
      <button type="button" onClick={() => void start()} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50">
        <Trash2 size={16} aria-hidden="true" />
        Darme de baja
      </button>

      {open && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/60 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-account-dialog" className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border border-line bg-card p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <h3 id="delete-account-dialog" className="flex items-center gap-2 text-lg font-bold text-ink">
                <AlertTriangle size={20} className="text-red-600" aria-hidden="true" />
                Eliminar mi cuenta
              </h3>
              <button type="button" onClick={() => setOpen(false)} disabled={deleting} aria-label="Cerrar" className="rounded-full p-1 text-ink-3 hover:text-ink"><X size={20} /></button>
            </div>

            {loadingPreview ? (
              <p role="status" className="flex items-center gap-2 text-sm text-ink-3"><Loader2 size={16} className="animate-spin" />Comprobando tu cuenta…</p>
            ) : preview?.is_app_admin ? (
              <p className="text-sm text-ink-2">Las cuentas de administración de Omiki no pueden darse de baja desde la app. Escríbenos a hola@omikigolf.com.</p>
            ) : preview && (
              <>
                <div className="space-y-2 text-sm text-ink-2">
                  <p><span className="font-semibold text-ink">La baja es inmediata y no se puede deshacer.</span></p>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>Se borran tu cuenta, tu perfil, tus avisos y tus invitaciones.</li>
                    <li>Si tienes una suscripción, se cancela y no se volverá a cobrar.</li>
                    <li>Tus resultados se quedan en los grupos con tu nombre marcado con * (por ejemplo, <span className="text-ink-4">Fede*</span>).</li>
                    <li>Tu nick quedará reservado 6 meses; después podrá usarlo otra persona.</li>
                  </ul>
                </div>

                {preview.groups.length > 0 && (
                  <div className="space-y-2 rounded-xl border border-line bg-card-2 p-3 text-sm">
                    <p className="font-semibold text-ink">Grupos que has creado</p>
                    {preview.groups.map(group => (
                      <p key={group.id} className="text-ink-2">
                        <span className="font-semibold text-ink">{group.name}</span>{' · '}
                        {group.admin
                          ? <>pasará a tener como creador a <span className="font-semibold">{group.admin.nick}</span>. Avisaremos a todos los miembros.</>
                          : group.members > 0
                            ? <span className="text-red-600">no tiene administrador: se quedará sin creador.</span>
                            : 'no tiene más miembros.'}
                      </p>
                    ))}
                    {groupsWithoutAdmin.length > 0 && (
                      <div className="rounded-lg bg-amber-50 p-3 text-amber-900">
                        <p>Antes de darte de baja, nombra a alguien administrador en Mis grupos → Jugadores y administradores. Así pasará a ser el creador del grupo. Si no lo haces, el grupo se quedará sin creador y avisaremos a sus miembros.</p>
                        {onOpenGroups && <button type="button" onClick={() => { setOpen(false); onOpenGroups(); }} className="mt-2 font-semibold underline">Ir a Mis grupos</button>}
                      </div>
                    )}
                  </div>
                )}

                <label className="block text-sm text-ink-2">
                  Escribe <span className="font-bold text-ink">{CONFIRMATION}</span> para confirmar
                  <input
                    value={confirmation}
                    onChange={event => setConfirmation(event.target.value)}
                    disabled={deleting}
                    autoComplete="off"
                    className="mt-2 block w-full rounded-xl border border-line bg-card p-3 text-ink"
                  />
                </label>
              </>
            )}

            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-3">
              <button type="button" onClick={() => setOpen(false)} disabled={deleting} className="flex-1 rounded-xl border border-line px-4 py-3 font-semibold text-ink-2">Cancelar</button>
              {!preview?.is_app_admin && (
                <button
                  type="button"
                  onClick={() => void confirmDeletion()}
                  disabled={confirmation !== CONFIRMATION || deleting || loadingPreview}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
                >
                  {deleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} aria-hidden="true" />}
                  {deleting ? 'Eliminando…' : 'Eliminar cuenta'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
