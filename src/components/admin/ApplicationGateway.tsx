import { OmikiLoadingScreen } from '../OmikiSpinner';
import { ReadOnlyProvider } from '../../context/ReadOnlyContext';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import App from '../../App';
import Auth from '../Auth';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabaseClient';
import { adminService, type AdminAccount } from '../../services/adminService';
import { NavigationButton } from '../NavigationButton';
import { AdminPasswordSetup } from './AdminPasswordSetup';
const AdminPortal = lazy(() => import('./AdminPortal').then(module => ({ default: module.AdminPortal })));

const initialUrl = new URL(window.location.href);
const initialRecovery = initialUrl.searchParams.has('admin-action') || initialUrl.searchParams.get('auth-action') === 'recovery' || initialUrl.hash.includes('type=recovery');

export function ApplicationGateway() {
  const { user, loading, logout } = useAuth();
  const [access, setAccess] = useState<{ id: string; account: AdminAccount | null; error?: string } | null>(null);
  const [recovery, setRecovery] = useState(initialRecovery);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    if (!user) { setAccess(null); return; }
    try {
      const account = await adminService.getAccount(user);
      if (request === generation.current) setAccess({ id: user.id, account });
    } catch (cause) {
      if (request === generation.current) setAccess({ id: user.id, account: null, error: cause instanceof Error ? cause.message : 'No se pueden verificar los permisos.' });
    }
  }, [user]);

  useEffect(() => {
    void refresh();
    return () => {
      // This counter invalidates pending requests; it is not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
    };
  }, [refresh]);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const adminId = access?.account?.user_id;
  useEffect(() => {
    if (!adminId) return;
    const check = () => { void refresh(); };
    window.addEventListener('focus', check);
    const timer = window.setInterval(check, 30000);
    return () => { window.removeEventListener('focus', check); window.clearInterval(timer); };
  }, [adminId, refresh]);

  const clearRecovery = () => {
    setRecovery(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('admin-action');
    url.searchParams.delete('auth-action');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  };
  const signOut = async () => { await logout(); clearRecovery(); };
  if (loading || (user && access?.id !== user.id)) return <OmikiLoadingScreen />;
  if (!user && recovery) return <>
    <p role="status" className="bg-card text-ink p-4 text-center">El enlace no ha iniciado una sesión. Solicita otro desde «¿Olvidaste tu contraseña?» usando tu correo o alias.</p>
    <Auth onAuthSuccess={() => {}} onBack={clearRecovery} backDestination="home" />
  </>;
  if (!user) return <ReadOnlyProvider><App /></ReadOnlyProvider>;
  if (access?.error || access?.account?.status === 'disabled') return (
    <main className="min-h-screen bg-app text-ink flex flex-col items-center justify-center gap-5 p-6">
      <h1 className="text-xl font-bold">{access.error ? 'No se ha podido comprobar el acceso' : 'Acceso administrativo no disponible'}</h1>
      <p role="alert">{access.error || 'Esta cuenta administradora está desactivada.'}</p>
      <button onClick={() => void refresh()} className="bg-card border border-line rounded-xl px-4 py-2">Reintentar</button>
      <NavigationButton destination="logout" onClick={() => void signOut()} />
    </main>
  );
  if (access?.account) {
    if (recovery || access.account.status === 'invited') return <AdminPasswordSetup account={access.account} onCancel={access.account.status === 'active' ? clearRecovery : undefined} onLogout={signOut} onDone={async () => { clearRecovery(); await refresh(); }} />;
    return <Suspense fallback={<div className="min-h-screen bg-app text-ink grid place-items-center" role="status">Cargando administración…</div>}><AdminPortal account={access.account} onLogout={signOut} onAccessChanged={refresh} onChangePassword={() => setRecovery(true)} /></Suspense>;
  }
  if (recovery) return <Auth recoveryRequested onRecoveryComplete={clearRecovery} onAuthSuccess={clearRecovery} onBack={clearRecovery} backDestination="home" />;
  return <ReadOnlyProvider><App /></ReadOnlyProvider>;
}
