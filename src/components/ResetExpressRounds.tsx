import { useRef, useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { AdminPinModal } from './AdminPinModal';
import { ConfirmModal } from './ConfirmModal';
import { useAuth } from '../context/AuthContext';
import { adminPinUtils } from '../utils/adminPin';
import { getUserId } from '../utils/userId';
import { supabase } from '../services/supabaseClient';
import { storageUtils } from '../utils/storage';

export function ResetExpressRounds() {
  const { user, loading: authLoading } = useAuth();
  const [showPin, setShowPin] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [pinError, setPinError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [userId] = useState(getUserId);
  const resetInProgress = useRef(false);

  const resetRounds = async () => {
    if (!authorized || resetInProgress.current || user || authLoading || userId !== getUserId()) return;
    resetInProgress.current = true;
    setBusy(true);
    setShowConfirm(false);
    setMessage('');
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (data.session) throw new Error('El reset solo está disponible sin iniciar sesión.');
      // Use the same UUID as creation and Express limits, including deleted rounds.
      const { error } = await supabase.from('golf_rounds')
        .delete().eq('user_id', userId).is('group_id', null);
      if (error) throw error;

      const { count, error: countError } = await supabase.from('golf_rounds')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId).is('group_id', null);
      if (countError) throw countError;
      if (count !== 0) throw new Error('No se han eliminado todas las partidas.');

      localStorage.removeItem('par_tee_express_count');
      localStorage.removeItem('par_tee_express_history');
      if (!storageUtils.getCurrentGroupId()) {
        storageUtils.clearGame();
        storageUtils.clearActiveRound();
      }
      // Reload to discard any in-memory round and refresh all counters.
      window.location.reload();
    } catch (error) {
      console.error('Error al resetear partidas Express:', error);
      setMessage('No se ha podido completar el reset. Inténtalo de nuevo.');
      setBusy(false);
      resetInProgress.current = false;
      setAuthorized(false);
    }
  };

  if (user || authLoading) return null;

  return (
    <>
      <button type="button"
        onClick={() => { setPinError(''); setMessage(''); setAuthorized(false); setShowPin(true); }}
        disabled={busy}
        aria-label="Resetear partidas Express"
        title="Resetear partidas Express"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600 shadow-soft transition-all hover:bg-red-100 hover:text-red-700 active:scale-95 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current max-[360px]:h-10 max-[360px]:w-10">
        {busy ? <Loader2 size={22} className="animate-spin" aria-hidden="true" /> : <Trash2 size={22} aria-hidden="true" />}
      </button>
      {message && <p role="alert" className="fixed bottom-5 left-4 right-4 z-50 mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-card">{message}</p>}
      {showPin && <AdminPinModal onCancel={() => setShowPin(false)} error={pinError}
        onSubmit={(pin) => {
          if (!adminPinUtils.verifyPin(pin)) {
            setPinError('Código incorrecto.');
            return;
          }
          setAuthorized(true);
          setShowPin(false);
          setShowConfirm(true);
        }} />}
      {showConfirm && <ConfirmModal
        message="¿Resetear tus partidas Express? Se eliminarán definitivamente las partidas rápidas de este dispositivo y volverás a disponer de 4 partidas."
        onConfirm={() => void resetRounds()}
        onCancel={() => { setShowConfirm(false); setAuthorized(false); }}
      />}
    </>
  );
}
