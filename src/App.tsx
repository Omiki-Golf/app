import { supabase } from './services/supabaseClient';
import { useNotificationCount } from './hooks/useNotificationCount';
import { useReadOnly } from './context/ReadOnlyContext';
import React, { lazy, Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { GolfRound, GolfHole, GolfCourse, RoundPlayer, RoundScore, Group, GameMode, PlanType, ScoreChangeInput, QuickPlayCompletedRound } from './types';
import { golfService } from './services/golfService';
import { calculateModePoints, ModeScoreInput } from './utils/calculations';
import { accessCodeStorage } from './utils/accessCode';
import { storageUtils } from './utils/storage';
import { getUserId, getDeviceUserId, isVerifiedLocalRoundCreator } from './utils/userId';
import { canEditRoundScores } from './utils/roundEditing';
import { useAuth } from './context/AuthContext'; // 👈 Importación del AuthContext
import { RoundSetup } from './components/RoundSetup';
import { PlayerSetup } from './components/PlayerSetup';
import { Scorecard } from './components/Scorecard';
import { OmikiLoadingScreen } from './components/OmikiSpinner';
import { Leaderboard } from './components/Leaderboard';
import { ActiveRoundsViewer } from './components/ActiveRoundsViewer';
import { HoleConfiguration } from './components/HoleConfiguration';
import { GamePoints } from './components/GamePoints';
import { AccessCodeModal } from './components/AccessCodeModal';
import { ConfirmModal } from './components/ConfirmModal';
import Auth from './components/Auth';
import MyGroups from './components/MyGroups';
import { ThemeToggle } from './components/ThemeToggle';
import { PlansComparison } from './components/PlansComparison';
import { PlayerCheckout } from './components/PlayerCheckout';
import { playerIntent, type BillingPeriod, type PaidPlan } from './utils/playerRegistration';
import { RegistrationForm } from './components/RegistrationForm';
import { HomeScreen } from './components/HomeScreen';
import { ProfileScreen } from './components/ProfileScreen';
import { ProfileDetails } from './components/ProfileDetails';
import { TeamCreation } from './components/TeamCreation';
import { NotificationsBell } from './components/NotificationsBell';
import { GlobalMessagesButton } from './components/GlobalMessagesButton';
import { ProShop } from './components/ProShop';
import { PaymentSelector } from './components/PaymentSelector';
import { useSubscription } from './hooks/useSubscription';
import { userService } from './services/userService';
import ShareModal from './components/ShareModal';
import { EmailConfirmedScreen } from './components/EmailConfirmedScreen';
import type { User } from '@supabase/supabase-js';

const Statistics = lazy(() => import('./components/Statistics').then(module => ({ default: module.Statistics })));
const QuickPlayStatistics = lazy(() => import('./components/QuickPlayStatistics').then(module => ({ default: module.QuickPlayStatistics })));
const CareerStatistics = lazy(() => import('./components/CareerStatistics').then(module => ({ default: module.CareerStatistics })));

type ViewType = 'player-checkout' | 'main' | 'setup' | 'players' | 'scorecard' | 'leaderboard' | 'active-rounds' | 'viewer' | 'game-points' | 'statistics' | 'quickplay-statistics' | 'auth' | 'my-groups' | 'plans' | 'registration' | 'profile' | 'profile-details' | 'team-creation' | 'pro-shop' | 'career-statistics';

interface RoundState {
  round: GolfRound | null;
  holes: GolfHole[];
  players: RoundPlayer[];
  scores: RoundScore[];
  currentHole: number;
  isCreator: boolean;
  hasEditAccess: boolean;
  courseName: string;
  course?: GolfCourse;
}

const GlobalThemeSwitch = () => (
  <div className="absolute right-3 top-3 z-[100]">
    <ThemeToggle />
  </div>
);

function App() {
  const readOnly = useReadOnly();
  const { user, logout, loading: authLoading } = useAuth(); // 👈 Usar el contexto global
  const [isIncognito, setIsIncognito] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
  const [isGroupCreator, setIsGroupCreator] = useState(false);
  const [ownedTeam, setOwnedTeam] = useState<Group | null>(null);
  const [hasGroupMembership, setHasGroupMembership] = useState(false);
  const [hasLimitedAccess, setHasLimitedAccess] = useState(false);
  const [groupLoading, setGroupLoading] = useState(true);
  const [currentView, setCurrentViewState] = useState<ViewType>('main');
  const currentViewRef = useRef<ViewType>('main');
  const historyIndexRef = useRef(1);
  const historyViewsRef = useRef(new Map<number, ViewType>([[0, 'main'], [1, 'main']]));
  const historyInitializedRef = useRef(false);
  const exitBackAtRef = useRef(0);
  const [showExitHint, setShowExitHint] = useState(false);

  const setCurrentView = useCallback((view: ViewType) => {
    if (view === currentViewRef.current) return;
    exitBackAtRef.current = 0;
    setShowExitHint(false);
    const previousIndex = historyIndexRef.current - 1;
    if (previousIndex >= 1 && historyViewsRef.current.get(previousIndex) === view) {
      window.history.back();
      return;
    }
    const nextIndex = historyIndexRef.current + 1;
    historyIndexRef.current = nextIndex;
    historyViewsRef.current.set(nextIndex, view);
    currentViewRef.current = view;
    window.history.pushState({ omikiApp: true, view, index: nextIndex }, '', window.location.href);
    setCurrentViewState(view);
  }, []);
  const [registrationPlan, setRegistrationPlan] = useState<PaidPlan>('player');
  const [registrationPeriod, setRegistrationPeriod] = useState<BillingPeriod>('annual');
  const [plansContext, setPlansContext] = useState<'default' | 'express-limit' | 'express-modes'>('default');
  const [authReturnView, setAuthReturnView] = useState<ViewType>('main');
  const [emailConfirmed, setEmailConfirmed] = useState(
    () => new URLSearchParams(window.location.search).get('email-confirmed') === '1'
  );
  // Stripe returns with ?stripe_checkout=success|cancelled. Read it once and
  // drop it from the address bar so it does not survive logout or reloads.
  const [checkoutReturn, setCheckoutReturn] = useState(
    () => new URLSearchParams(window.location.search).get('stripe_checkout')
  );
  const [roundState, setRoundState] = useState<RoundState>({
    round: null,
    holes: [],
    players: [],
    scores: [],
    currentHole: 1,
    isCreator: false,
    hasEditAccess: false,
    courseName: '',
  });
  const [showHoleConfig, setShowHoleConfig] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAccessCodeModal, setShowAccessCodeModal] = useState(false);
  const [pendingRoundId, setPendingRoundId] = useState<string | null>(null);
  const [accessCodeError, setAccessCodeError] = useState('');
  const [sharedExpressStats, setSharedExpressStats] = useState<QuickPlayCompletedRound | null>(null);
  const [showLeaveGroupConfirm, setShowLeaveGroupConfirm] = useState(false);
  const { planType, profile, loading: subscriptionLoading, refresh: refreshSubscription } = useSubscription(user?.id ?? null);

  // Arranque: la app se muestra cuando ya se conocen la sesión, el perfil, el plan y sus imágenes
  // principales; así no aparece primero el avatar genérico ni las imágenes cargándose.
  // Solo ocurre una vez: los refrescos posteriores no vuelven a mostrar la pantalla de carga.
  const [booted, setBooted] = useState(false);
  const accountReady = !authLoading && (!user || !subscriptionLoading);
  useEffect(() => {
    if (booted || !accountReady) return;
    let cancelled = false;
    const urls = ['/images/Omiki_VerdeAmarillo_Trans_Optimizada.png', profile?.avatar_url].filter((url): url is string => !!url);
    const decode = (url: string) => new Promise<void>((resolve) => {
      const image = new Image();
      image.src = url;
      image.decode().then(() => resolve(), () => resolve());
    });
    // Si una imagen tarda o falla, la app se abre igualmente.
    const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, 1500));
    void Promise.race([Promise.all(urls.map(decode)), timeout]).then(() => { if (!cancelled) setBooted(true); });
    return () => { cancelled = true; };
  }, [booted, accountReady, profile?.avatar_url]);
  const activityScope = currentGroup
    ? { groupId: currentGroup.id }
    : { roundId: roundState.round?.group_id ? null : roundState.round?.id, accessCode: roundState.round?.id ? accessCodeStorage.getAccessCode(roundState.round.id) : null };
  const {count: pendingInvitations, refresh: refreshNotifications} = useNotificationCount(user?.id ?? null, currentView, activityScope);
  const refreshGroupMembership = useCallback(async () => {
    if (!user?.id) {
      setHasGroupMembership(false);
      return;
    }
    const { count, error } = await supabase
      .from('group_members')
      .select('group_id', { count: 'exact', head: true })
      .eq('user_id', user.id);
    if (!error) setHasGroupMembership((count ?? 0) > 0);
  }, [user?.id]);
  const handleNotificationsRefresh = useCallback(() => {
    void refreshNotifications();
    void refreshGroupMembership();
  }, [refreshNotifications, refreshGroupMembership]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentAmount] = useState(0);
  const [paymentDescription] = useState('');
  const [simulatorEnabled, setSimulatorEnabled] = useState(false);
  const [simulatedPlan, setSimulatedPlan] = useState<PlanType | null>(null);
  const [simulatorUpdating, setSimulatorUpdating] = useState(false);
  const [returnToProfile, setReturnToProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const messagesOpenRef = useRef(false);
  useEffect(() => { messagesOpenRef.current = messagesOpen; }, [messagesOpen]);
  // Paid access comes from the server-confirmed database subscription.
  const activePlanType = planType;

  const pendingPlayer = playerIntent(user?.user_metadata || {});
  const pendingPlayerId = pendingPlayer && user?.user_metadata.player_checkout_acknowledged !== pendingPlayer.id ? pendingPlayer.id : null;
  useEffect(() => {
    if (user && pendingPlayerId) {
      setEmailConfirmed(false);
      setCurrentView('player-checkout');
    }
  }, [user, pendingPlayerId, setCurrentView]);

  useEffect(() => {
    // Simulator state belongs to a single authenticated user. Keeping it when
    // switching accounts can make the next account display the previous plan.
    setSimulatorEnabled(false);
    setSimulatedPlan(null);
    setSimulatorUpdating(false);
  }, [user?.id]);

  useEffect(() => {
    if (currentView === 'players' || currentView === 'scorecard' || currentView === 'leaderboard' || currentView === 'viewer') {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }, [currentView, roundState.round?.id]);

  useEffect(() => {
    if (!profileSaved) return;
    const timeoutId = window.setTimeout(() => setProfileSaved(false), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [profileSaved]);

  useEffect(() => {
    if (!historyInitializedRef.current) {
      historyInitializedRef.current = true;
      const initialView = currentViewRef.current;
      historyIndexRef.current = 1;
      historyViewsRef.current = new Map([[0, initialView], [1, initialView]]);
      const initialState = { ...(window.history.state || {}), omikiApp: true, view: initialView, index: 0 };
      window.history.replaceState(initialState, document.title, window.location.href);
      window.history.pushState({ ...initialState, index: 1 }, document.title, window.location.href);
    }

    const handlePopState = (event: PopStateEvent) => {
      if (messagesOpenRef.current) {
        setMessagesOpen(false);
        return;
      }
      const state = event.state as { omikiApp?: boolean; view?: ViewType; index?: number } | null;
      if (!state?.omikiApp || typeof state.index !== 'number') return;
      if (state.index === 0) {
        const now = Date.now();
        if (now - exitBackAtRef.current <= 2000) {
          window.history.back();
          return;
        }
        exitBackAtRef.current = now;
        setShowExitHint(true);
        window.history.pushState({ omikiApp: true, view: 'main', index: 1 }, '', window.location.href);
        historyIndexRef.current = 1;
        currentViewRef.current = 'main';
        setCurrentViewState('main');
        window.setTimeout(() => setShowExitHint(false), 2000);
        return;
      }
      const restoredView = state.view && historyViewsRef.current.get(state.index) === state.view ? state.view : 'main';
      historyIndexRef.current = state.index;
      currentViewRef.current = restoredView;
      setCurrentViewState(restoredView);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openMessages = () => {
    if (messagesOpen) return;
    window.history.pushState({ ...(window.history.state || {}), omikiMessages: true }, '', window.location.href);
    setMessagesOpen(true);
  };
  const closeMessages = () => {
    if (window.history.state?.omikiMessages) window.history.back();
    else setMessagesOpen(false);
  };

  const openAuth = (returnView: ViewType) => {
    setAuthReturnView(returnView);
    setCurrentView('auth');
  };

  const openFromProfile = (view: ViewType) => {
    setReturnToProfile(true);
    setCurrentView(view);
  };

  const backFromProfileSection = (fallback: ViewType) => {
    if (returnToProfile) {
      setReturnToProfile(false);
      setCurrentView('profile');
      return;
    }
    setCurrentView(fallback);
  };

  const handleToggleSimulator = () => {
    if (readOnly) return;
    if (!user) {
      openAuth('main');
      return;
    }

    setSimulatorEnabled((enabled) => {
      if (!enabled) setSimulatedPlan(planType);
      return !enabled;
    });
  };

  const handleCycleSimulatorPlan = async () => {
    if (readOnly) return;
    if (!user || simulatorUpdating) return;

    const currentPlan = simulatedPlan ?? planType;
    const nextPlan: PlanType = currentPlan === 'express'
      ? 'player'
      : currentPlan === 'player'
        ? 'team'
        : 'express';

    setSimulatorUpdating(true);
    setSimulatedPlan(nextPlan);
    try {
      // The simulator only previews labels; paid access is confirmed by Stripe.
    } catch (error) {
      console.error('Error actualizando el plan del simulador:', error);
    } finally {
      setSimulatorUpdating(false);
    }
  };

  useEffect(() => {
    if (!emailConfirmed) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('email-confirmed');
    window.history.replaceState(window.history.state, document.title, `${url.pathname}${url.search}${url.hash}`);
  }, [emailConfirmed]);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('stripe_checkout')) return;
    url.searchParams.delete('stripe_checkout');
    window.history.replaceState(window.history.state, document.title, `${url.pathname}${url.search}${url.hash}`);
  }, []);
  useEffect(() => {
    const checkIncognito = () => {
      try {
        const testKey = '__test__';
        localStorage.setItem(testKey, 'test');
        localStorage.removeItem(testKey);
        console.log('✅ localStorage disponible');
        setIsIncognito(false);
      } catch {
        console.log('⚠️ Modo incógnito detectado');
        setIsIncognito(true);
      }
    };
    checkIncognito();
  }, []);

  useEffect(() => {
    const handleOpenProfileScreen = () => {
      if (authUser) {
        setCurrentView('profile');
      }
    };

    window.addEventListener('open-profile-screen', handleOpenProfileScreen);

    return () => {
      window.removeEventListener('open-profile-screen', handleOpenProfileScreen);
    };
  }, [authUser, setCurrentView]);

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔄 Auth state change:', event);
      if (event === 'PASSWORD_RECOVERY') {
        setCurrentView('auth');
      } else if (event === 'SIGNED_IN') {
        setAuthUser(session?.user || null);
      } else if (event === 'SIGNED_OUT') {
        setAuthUser(null);
      }
    });

    void supabase.auth.getUser()
      .then(({ data, error }) => {
        if (error) throw error;
        if (!active) return;
        if (!data.user) console.log('No user authenticated');
        else console.log('✅ User authenticated:', data.user.email);
        setAuthUser(data.user);
      })
      .catch((error: unknown) => console.error('❌ Error in checkAuth:', error));

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [setCurrentView]);

  useEffect(() => {
    const checkGroup = async () => {
      try {
        console.log('👥 Checking group...');
        const group = await golfService.getCurrentGroup();

        if (group) {
          console.log('✅ Group found:', group.group_code);
          const isCreator = await resolveGroupManager(group);
          const limitedAccess = storageUtils.hasLimitedAccess();
          storageUtils.saveCurrentGroup(group.id, group.group_code, isCreator, limitedAccess);
          setIsGroupCreator(isCreator);
          setHasLimitedAccess(limitedAccess);
        } else {
          console.log('ℹ️ No group found');
        }

        setCurrentGroup(group);
      } catch (err) {
        console.error('❌ Error checking group:', err);
      } finally {
        console.log('✅ Group loading complete');
        setGroupLoading(false);
      }
    };
    checkGroup();
  }, []);

  const hasActiveRound = Boolean(roundState.round);

  useEffect(() => {
    const restoreActiveRound = async () => {
      if (groupLoading) return;

      const activeRoundId = storageUtils.getActiveRoundId();
      if (activeRoundId && !hasActiveRound) {
        try {
          setLoading(true);
          const roundData = await golfService.getRoundWithDetails(activeRoundId);
          if (roundData) {
            const isCreator = isVerifiedLocalRoundCreator(roundData.round.user_id);
            const hasEditAccess = canEditRoundScores(isCreator, roundData.round.status);

            if (!roundData.round.group_id && roundData.round.status !== 'active' && !isCreator && roundData.round.user_id !== getDeviceUserId()) {
              accessCodeStorage.removeAccessCode(activeRoundId);
              storageUtils.clearActiveRound();
              setCurrentView('setup');
              return;
            }

            const course = await golfService.getCourse(roundData.round.course_id);

            setRoundState({
              round: roundData.round,
              holes: roundData.holes,
              players: roundData.players,
              scores: roundData.scores,
              currentHole: 1,
              isCreator,
              hasEditAccess,
              courseName: course?.name || '',
            });

            if (roundData.players.length === 0) {
              setCurrentView('players');
            } else {
              setCurrentView('scorecard');
            }
          }
        } catch (err) {
          console.error('Error restoring active round:', err);
          storageUtils.clearActiveRound();
        } finally {
          setLoading(false);
        }
      }
    };
    restoreActiveRound();
  }, [groupLoading, hasActiveRound, setCurrentView]);

  useEffect(() => {
    const roundId = roundState.round?.id;
    if (!roundId || (currentView !== 'scorecard' && currentView !== 'leaderboard' && currentView !== 'players')) {
      return;
    }

    const scoresSubscription = golfService.subscribeToRoundScores(roundId, async () => {
      try {
        const scores = await golfService.getRoundScores(roundId);
        setRoundState((prev) => ({
          ...prev,
          scores,
        }));
      } catch (err) {
        console.error('Error updating scores:', err);
      }
    });

    const playersSubscription = golfService.subscribeToRoundPlayers(roundId, async () => {
      try {
        const players = await golfService.getRoundPlayers(roundId);
        setRoundState((prev) => ({
          ...prev,
          players,
        }));
      } catch (err) {
        console.error('Error updating players:', err);
      }
    });

    return () => {
      scoresSubscription.unsubscribe();
      playersSubscription.unsubscribe();
    };
  }, [roundState.round?.id, currentView]);

  useEffect(() => {
    const roundId = roundState.round?.id;
    if (!roundId) return;
    const isGroupRound = !!roundState.round?.group_id;
    let live = true;
    const refreshRound = async () => {
      try {
        const { supabase } = await import('./services/supabaseClient');
        const { data, error } = await supabase.from('golf_rounds').select('*').eq('id', roundId).maybeSingle();
        if (!live || error) return;
        if (!data || data.admin_withdrawn_at) {
          storageUtils.clearActiveRound();
          setRoundState(prev => prev.round?.id === roundId ? {...prev, round: null, players: [], scores: [], hasEditAccess: false} : prev);
          setCurrentView('setup');
          return;
        }
        if (!live) return;
        if (isGroupRound) {
          // El creador puede corregir resultados finalizados hasta archivar la partida.
          setRoundState(prev => prev.round?.id === roundId
            ? { ...prev, round: data, hasEditAccess: canEditRoundScores(prev.isCreator, data.status) }
            : prev);
          return;
        }
        if (data.status === 'completed' && data.user_id !== getUserId()) {
          // El creador ha finalizado: el invitado sigue viendo la tarjeta, ya en solo lectura.
          accessCodeStorage.removeAccessCode(roundId);
          storageUtils.clearActiveRound();
          setRoundState(prev => prev.round?.id === roundId ? { ...prev, round: data, hasEditAccess: false } : prev);
          return;
        }
        if (data.status !== 'active' && data.user_id !== getUserId()) {
          accessCodeStorage.removeAccessCode(roundId);
          storageUtils.clearActiveRound();
          setRoundState(prev => prev.round?.id === roundId ? { ...prev, round: null, players: [], scores: [], hasEditAccess: false } : prev);
          setCurrentView('setup');
          return;
        }
        const edit = canEditRoundScores(isVerifiedLocalRoundCreator(data.user_id), data.status);
        setRoundState(prev => prev.round?.id === roundId ? {...prev, round: data, hasEditAccess: edit} : prev);
      } catch { /* Keep the existing view on a transient network failure. */ }
    };
    const check = () => { void refreshRound(); };
    const timer = window.setInterval(check, 30000);
    const statusSubscription = supabase
      .channel(`express-round-status-${roundId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'golf_rounds', filter: `id=eq.${roundId}` }, check)
      .subscribe();
    window.addEventListener('focus', check);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
      void supabase.removeChannel(statusSubscription);
    };
  }, [roundState.round?.id, roundState.round?.group_id, setCurrentView]);

  // El botón de Team de la pantalla de inicio muestra el grupo propio cuando ya existe.
  useEffect(() => {
    if (!user?.id || currentView !== 'main') return;
    let active = true;
    golfService.getOwnedGroup(user.id)
      .then((group) => { if (active) setOwnedTeam(group); })
      .catch(() => { if (active) setOwnedTeam(null); });
    return () => { active = false; };
  }, [user?.id, currentView]);

  // Mis grupos aparece en el perfil de cualquier miembro de un grupo, también con plan Player.
  useEffect(() => {
    if (!user?.id || currentView !== 'profile') return;
    void refreshGroupMembership();
  }, [user?.id, currentView, refreshGroupMembership]);

  // Gestiona el grupo (crea partidas) su creador o cualquier administrador del grupo.
  const resolveGroupManager = async (group: Group): Promise<boolean> => {
    if (group.group_code === 'DIVEND') return true;
    const { data: { user: authAccount } } = await supabase.auth.getUser();
    const currentUserId = authAccount?.id ?? getUserId();
    if (currentUserId === group.created_by) return true;
    if (!authAccount) return false;
    try {
      return (await golfService.getMemberRole(group.id, authAccount.id)) === 'admin';
    } catch {
      return false;
    }
  };

  const handleGroupJoined = async (group: Group) => {
    const isCreator = await resolveGroupManager(group);

    const limitedAccess = storageUtils.hasLimitedAccess();
    storageUtils.saveCurrentGroup(group.id, group.group_code, isCreator, limitedAccess);
    setCurrentGroup(group);
    setIsGroupCreator(isCreator);
    setHasLimitedAccess(limitedAccess);
    setCurrentView('main');
  };

  const handleLeaveGroup = () => {
    setShowLeaveGroupConfirm(true);
  };

  const handleConfirmLeaveGroup = () => {
    golfService.leaveGroup();
    setCurrentGroup(null);
    setIsGroupCreator(false);
    setHasLimitedAccess(false);
    setShowLeaveGroupConfirm(false);
    handleBackToMain();
  };

  const handleCancelLeaveGroup = () => {
    setShowLeaveGroupConfirm(false);
  };

  const handleRoundCreated = async (roundId: string, courseId: string, numHoles: 9 | 18, useSlope: boolean, startImmediately = false) => {
    try {
      setLoading(true);
      const roundData = await golfService.getRoundWithDetails(roundId);
      if (roundData) {
        accessCodeStorage.saveAccessCode(roundId, roundData.round.access_code);

        const course = await golfService.getCourse(courseId);

        setRoundState({
          round: roundData.round,
          holes: roundData.holes,
          players: roundData.players,
          scores: roundData.scores,
          currentHole: 1,
          isCreator: true,
          hasEditAccess: true,
          courseName: course?.name || '',
        });
        setCurrentView(startImmediately && roundData.players.length > 0 ? 'scorecard' : 'players');
      }
    } catch (err) {
      setError('Error creando partida');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRound = async (roundId: string) => {
    try {
      setLoading(true);
      const roundData = await golfService.getRoundWithDetails(roundId);
      if (roundData) {
        const isCreator = isVerifiedLocalRoundCreator(roundData.round.user_id);
        const storedCode = accessCodeStorage.getAccessCode(roundId);
        const hasEditAccess = canEditRoundScores(isCreator, roundData.round.status);

        if (!roundData.round.group_id && !isCreator && storedCode === roundData.round.access_code) {
          await golfService.registerExpressRoundAccess(roundId, storedCode);
        }

        const course = await golfService.getCourse(roundData.round.course_id);

        setRoundState({
          round: roundData.round,
          holes: roundData.holes,
          players: roundData.players,
          scores: roundData.scores,
          currentHole: 1,
          isCreator,
          hasEditAccess,
          courseName: course?.name || '',
        });

        storageUtils.saveActiveRound(roundId);

        if (roundData.players.length === 0) {
          setCurrentView('players');
        } else {
          setCurrentView('scorecard');
        }
      }
    } catch (err) {
      setError('Error cargando partida');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayersUpdated = (players: RoundPlayer[]) => {
    setRoundState((prev) => ({ ...prev, players }));
  };

  const handleStartRound = () => {
    setCurrentView('scorecard');
  };

  const handleHoleChange = (holeNumber: number) => {
    setRoundState((prev) => ({ ...prev, currentHole: holeNumber }));
  };

  const handleScoreChange = async (playerId: string, holeNumber: number, score: ScoreChangeInput | null) => {
    console.log('=== handleScoreChange llamado ===');

    if (!roundState.round || !roundState.hasEditAccess || readOnly) {
      console.log('No hay round activo');
      return;
    }
    const editingRoundId = roundState.round.id;
    setError('');

    try {
      if (score === null) {
        await golfService.deleteScore(roundState.round.id, playerId, holeNumber);
        setRoundState((prev) => ({
          ...prev,
          scores: prev.scores.filter((s) => !(s.player_id === playerId && s.hole_number === holeNumber)),
        }));
        return;
      }

      const grossStrokes = score.grossStrokes ?? score.gross_strokes;
      const strokesReceived = score.strokesReceived ?? score.strokes_received;
      const netStrokes = score.netStrokes ?? score.net_strokes;
      if (typeof netStrokes !== 'number') {
        throw new Error('El resultado del hoyo no contiene los golpes netos.');
      }
      const stablefordPoints = score.stablefordPoints ?? score.stableford_points;
      const noPasoRojas = score.no_paso_rojas ?? false;
      const spanishHands = score.spanish_hands ?? false;
      const abandoned = score.abandoned ?? false;
      const modePoints = score.mode_points ?? 0;

      const gameMode = (roundState.round.game_mode || 'stableford') as GameMode;
      const isModeScoring = gameMode !== 'stableford';

      const teamAssignments: Record<string, 0 | 1> | undefined = gameMode === 'parejas' && roundState.players.length === 4
        ? Object.fromEntries(roundState.players.map((p, i) => [p.id, i < 2 ? 0 as const : 1 as const]))
        : undefined;

      const otherScores = roundState.scores.filter(
        (s) => s.hole_number === holeNumber && s.player_id !== playerId
      );

      const updatedOtherScores: RoundScore[] = [];
      if (isModeScoring && otherScores.length > 0) {
        const allInputs: ModeScoreInput[] = roundState.players.map((p) => {
          if (p.id === playerId) {
            return {
              playerId: p.id,
              netStrokes: abandoned ? 999 : netStrokes,
              abandoned,
              entered: true,
            };
          }
          const existing = otherScores.find((s) => s.player_id === p.id);
          if (!existing) {
            return { playerId: p.id, netStrokes: 999, abandoned: true, entered: false };
          }
          return { playerId: p.id, netStrokes: existing.abandoned ? 999 : existing.net_strokes, abandoned: existing.abandoned, entered: true };
        });

        for (const existing of otherScores) {
          const newModePoints = calculateModePoints(gameMode, existing.player_id, allInputs, teamAssignments);
          if (newModePoints !== existing.mode_points) {
            updatedOtherScores.push({
              ...existing,
              mode_points: newModePoints,
              updated_at: new Date().toISOString(),
            });
          }
        }
      }

      const savedScores = await golfService.recordHoleScores(editingRoundId, holeNumber, [
        { round_id: editingRoundId, player_id: playerId, hole_number: holeNumber,
          gross_strokes: grossStrokes, strokes_received: strokesReceived, net_strokes: netStrokes,
          stableford_points: stablefordPoints, no_paso_rojas: noPasoRojas,
          spanish_hands: spanishHands, abandoned, mode_points: modePoints },
        ...updatedOtherScores,
      ]);
      let decidedResult = roundState.round.decided_result || null;
      if (isModeScoring && !decidedResult) {
        try {
          decidedResult = await golfService.recordRoundDecision(roundState.round.id);
        } catch (decisionError) {
          console.error('Error guardando el resultado definitivo:', decisionError);
        }
      }

      setRoundState((prev) => prev.round?.id !== editingRoundId ? prev : ({
        ...prev,
        round: prev.round && decidedResult
          ? { ...prev.round, decided_result: decidedResult, decided_at: prev.round.decided_at || new Date().toISOString() }
          : prev.round,
        scores: [
          ...prev.scores.filter(s => !savedScores.some(saved => saved.player_id === s.player_id && saved.hole_number === s.hole_number)),
          ...savedScores,
        ],
      }));
    } catch (err) {
      const denied = !!err && typeof err === 'object' && 'code' in err && err.code === '42501';
      setError(err && typeof err === 'object' && 'message' in err ? String(err.message) : 'No se ha guardado el golpe. Comprueba la conexión e inténtalo de nuevo.');
      if (denied) {
        const roundId = editingRoundId;
        setRoundState(prev => prev.round?.id === roundId ? { ...prev, hasEditAccess: false } : prev);
        if (roundId) {
          try {
            const fresh = await golfService.getRoundWithDetails(roundId);
            if (fresh) setRoundState(prev => prev.round?.id === roundId ? { ...prev, round: fresh.round, scores: fresh.scores, hasEditAccess: false } : prev);
          } catch { /* Keep the explicit denial and existing card on a network failure. */ }
        }
      }
    }
  };

  const handleHolesUpdated = (updatedHoles: GolfHole[]) => {
    setRoundState((prev) => ({ ...prev, holes: updatedHoles }));
  };

  const handleHolesChanged = async (numHoles: 9 | 18, holes: GolfHole[]) => {
    if (!roundState.round) return;

    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      const updatedPlayers = await golfService.getRoundPlayers(roundState.round.id);

      setRoundState((prev) => ({
        ...prev,
        holes,
        players: updatedPlayers,
        round: prev.round ? { ...prev.round, num_holes: numHoles } : null,
      }));
    } catch (error) {
      console.error('Error reloading players:', error);
      setRoundState((prev) => ({
        ...prev,
        holes,
        round: prev.round ? { ...prev.round, num_holes: numHoles } : null,
      }));
    }
  };

  const handleCourseChanged = async (courseId: string, numHoles: 9 | 18, holes: GolfHole[], updatedPlayers?: RoundPlayer[]) => {
    if (!roundState.round) return;

    try {
      const players = updatedPlayers || await golfService.getRoundPlayers(roundState.round.id);
      const updatedScores = await golfService.getRoundScores(roundState.round.id);
      const course = await golfService.getCourse(courseId);

      const newPlayers = players.map(p => ({ ...p }));

      setRoundState((prev) => ({
        ...prev,
        holes,
        players: newPlayers,
        scores: updatedScores,
        round: prev.round ? {
          ...prev.round,
          course_id: courseId,
          num_holes: numHoles,
        } : null,
        courseName: course?.name || prev.courseName,
      }));
    } catch (error) {
      console.error('Error reloading after course change:', error);
      setRoundState((prev) => ({
        ...prev,
        holes,
        round: prev.round ? {
          ...prev.round,
          course_id: courseId,
          num_holes: numHoles,
        } : null,
      }));
    }
  };

  const handleAccessCodeSubmit = async (code: string) => {
    try {
      setLoading(true);
      setAccessCodeError('');

      if (pendingRoundId) {
        const isValid = await golfService.verifyAccessCode(pendingRoundId, code);

        if (isValid) {
          accessCodeStorage.saveAccessCode(pendingRoundId, code);
          setShowAccessCodeModal(false);
          setPendingRoundId(null);
          await handleJoinRound(pendingRoundId);
        } else {
          setAccessCodeError('Código de acceso incorrecto');
        }
      } else {
        const round = await golfService.getRoundByAccessCode(code, currentGroup?.id, !currentGroup);

        if (round) {
          if (!currentGroup && round.group_id) {
            const { data: group } = await supabase.from('groups').select('*').eq('id', round.group_id).maybeSingle();
            if (group) {
              storageUtils.saveCurrentGroup(group.id, group.group_code, false, true);
              setCurrentGroup(group);
              setIsGroupCreator(false);
              setHasLimitedAccess(true);
            }
          }
          accessCodeStorage.saveAccessCode(round.id, code);
          setShowAccessCodeModal(false);
          await handleJoinRound(round.id);
        } else if (!currentGroup) {
          const statistics = await golfService.getExpressRoundStatisticsByCode(code);
          if (statistics) {
            setSharedExpressStats(statistics);
            setShowAccessCodeModal(false);
            setCurrentView('quickplay-statistics');
          } else {
            setAccessCodeError('No se encontró una partida con ese código');
          }
        } else {
          setAccessCodeError('No se encontró una partida con ese código');
        }
      }
    } catch (err) {
      setAccessCodeError('Error verificando código');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAccessCodeCancel = () => {
    setShowAccessCodeModal(false);
    setPendingRoundId(null);
    setAccessCodeError('');
  };

  const handleBackToMain = () => {
    storageUtils.clearActiveRound();
    setRoundState({
      round: null,
      holes: [],
      players: [],
      scores: [],
      currentHole: 1,
      isCreator: false,
      hasEditAccess: false,
      courseName: '',
    });
    if (currentGroup) {
      setCurrentView('main');
    } else {
      setCurrentView('setup');
    }
  };

  const handleFinishRound = async () => {
    if (!roundState.round) return;

    try {
      setLoading(true);
      const isQuickPlay = !roundState.round.group_id;
      await golfService.finishRound(roundState.round.id);
      storageUtils.clearActiveRound();

      if (isQuickPlay) {
        if (roundState.isCreator) setCurrentView('quickplay-statistics');
        else {
          accessCodeStorage.removeAccessCode(roundState.round.id);
          setRoundState(prev => ({ ...prev, round: null, players: [], scores: [], hasEditAccess: false }));
          setCurrentView('setup');
        }
      } else if (currentGroup) {
        // En grupos se vuelve a las partidas del grupo, donde se ve el resumen y se archiva.
        setCurrentView('active-rounds');
      } else {
        setCurrentView('setup');
      }
    } catch (err) {
      console.error('Error al finalizar la partida:', err);
      const message = err instanceof Error
        ? err.message
        : (err && typeof err === 'object' && 'message' in err ? String(err.message) : 'Error al finalizar la partida');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const IncognitoWarning = () => (
    <>
      {isIncognito && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white px-4 py-2 text-center text-sm font-medium shadow-card">
          <div className="flex items-center justify-center gap-2">
            <AlertTriangle size={16} />
            <span>Modo incógnito: No recargues la página o perderás todos los datos</span>
          </div>
        </div>
      )}
    </>
  );

  const usesInlineMessages = currentView === 'main' || currentView === 'setup' || currentView === 'players' || currentView === 'scorecard' || currentView === 'leaderboard' || currentView === 'profile' || currentView === 'quickplay-statistics'
    || currentView === 'profile-details' || currentView === 'career-statistics' || currentView === 'my-groups' || currentView === 'pro-shop' || currentView === 'active-rounds' || currentView === 'statistics' || currentView === 'game-points';
  const inlineMessagesButton = <GlobalMessagesButton count={pendingInvitations} onClick={openMessages} variant="inline" />;
  const withMessages = (content: React.ReactNode) => <>
    {error && <div role="alert" className="bg-red-50 text-red-800 p-4 flex items-center justify-between gap-3"><p>{error}</p><button type="button" onClick={() => setError('')} aria-label="Cerrar aviso">Cerrar</button></div>}
    {showExitHint && (
      <div role="status" className="fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
        Pulsa atrás otra vez para salir
      </div>
    )}
    {!usesInlineMessages && <GlobalMessagesButton count={pendingInvitations} onClick={openMessages} belowWarning={isIncognito} />}
    {messagesOpen && <NotificationsBell
      key={`${user?.id || 'express'}-${activityScope.groupId || activityScope.roundId || 'general'}`}
      userId={user?.id ?? null}
      activityScope={activityScope}
      onBack={closeMessages}
      onInvitationResolved={handleNotificationsRefresh}
      onInvitationAccepted={() => {
        closeMessages();
        setCurrentGroup(null);
        setCurrentView('my-groups');
      }}
    />}
    {content}
  </>;

  if (currentView === 'player-checkout' && user) {
    return <PlayerCheckout key={user.id} userId={user.id} checkoutReturn={checkoutReturn} onBack={() => { setCheckoutReturn(null); setCurrentView('main'); }} onDone={async () => { await refreshSubscription(); setCheckoutReturn(null); setCurrentGroup(null); setCurrentView('main'); }} />;
  }

  if (emailConfirmed) {
    return (
      <EmailConfirmedScreen
        onLogin={async () => {
          await logout();
          setEmailConfirmed(false);
          openAuth('main');
        }}
      />
    );
  }

  if (currentView === 'plans') {
    return (
      <>
        <IncognitoWarning />
        <div className={isIncognito ? 'pt-10' : ''}>
          <PlansComparison backDestination={returnToProfile ? 'back' : 'home'}
            onBack={() => {
              if (plansContext === 'express-limit' || plansContext === 'express-modes') {
                setPlansContext('default');
                setCurrentView('setup');
              } else backFromProfileSection('main');
            }}
            expressLimit={plansContext === 'express-limit'}
            expressModes={plansContext === 'express-modes'}
            currentPlan={user ? activePlanType : undefined}
            onStartTeamTrial={user && activePlanType === 'player' ? async () => {
              await userService.startTeamTrial();
              await refreshSubscription();
              setReturnToProfile(false);
              setCurrentView('profile');
            } : undefined}
            onSelectPlan={(plan) => {
              if (plan === 'express') {
                setCurrentView('main');
              } else {
                setCurrentView('registration');
              }
            }}
            onRegisterPlan={(plan, period) => {
              setRegistrationPlan(plan);
              setRegistrationPeriod(period);
              if (user) setCurrentView(pendingPlayer ? 'player-checkout' : 'profile');
              else setCurrentView('registration');
            }}
            onShowAuth={user || plansContext === 'express-limit' ? undefined : () => openAuth('plans')}
          />
        </div>
      </>
    );
  }

  if (currentView === 'registration') {
    return (
      <>
        <IncognitoWarning />
        {!user && <GlobalThemeSwitch />}
        <div className={isIncognito ? 'pt-10' : ''}>
          <RegistrationForm
            period={registrationPeriod}
            plan={registrationPlan}
            onLogin={() => openAuth('plans')}
            onBack={() => setCurrentView('plans')}
            onConfirmationAccepted={() => openAuth('plans')}
            onRegistered={() => { setEmailConfirmed(false); setCurrentView('player-checkout'); }}
          />
        </div>
      </>
    );
  }

  if (groupLoading || !booted) {
    return (
      <>
        <IncognitoWarning />
        <OmikiLoadingScreen className={`bg-app ${isIncognito ? 'pt-10' : ''}`} />
      </>
    );
  }

  if (currentView === 'profile') {
    return withMessages(
      <>
        <IncognitoWarning />
        {profileSaved && (
          <div
            role="status"
            className="fixed top-16 left-1/2 z-[110] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-xl border border-accent-ring bg-card px-4 py-3 text-sm font-medium text-ink shadow-card"
          >
            <CheckCircle2 size={19} className="text-accent-ink" />
            Perfil actualizado correctamente
          </div>
        )}
        <div className={isIncognito ? 'pt-10' : ''}>
          <ProfileScreen
            profile={profile}
            planType={activePlanType}
            onBack={() => {
              setReturnToProfile(false);
              setCurrentView('main');
            }}
            onLogout={async () => {
              await logout();
              setCurrentView('main');
            }}
            onShowRoundStats={() => openFromProfile(currentGroup ? 'statistics' : 'quickplay-statistics')}
            onShowCareerStats={() => setCurrentView('career-statistics')}
            onShowPlans={() => { setPlansContext('default'); openFromProfile('plans'); }}
            onShowProShop={() => setCurrentView('pro-shop')}
            onShowGroups={() => openFromProfile('my-groups')}
            hasGroups={hasGroupMembership}
            onShowSettings={() => setCurrentView('profile-details')}
            messagesButton={inlineMessagesButton}
          />
        </div>
      </>
    );
  }

  if (currentView === 'career-statistics' && user) {
    return withMessages(
      <>
        <IncognitoWarning />
        <div className={isIncognito ? 'pt-10' : ''}>
          <Suspense fallback={<p role="status" className="p-6 text-center text-ink">Cargando estadísticas…</p>}><CareerStatistics
            account={{ userId: user.id, nick: profile?.nick ?? '', displayName: profile?.display_name }}
            showMoments={activePlanType !== 'player'}
            onBack={() => setCurrentView('profile')}
            messagesButton={inlineMessagesButton}
          /></Suspense>
        </div>
      </>
    );
  }

  if (currentView === 'profile-details' && user) {
    return withMessages(
      <>
        <IncognitoWarning />
        <div className={isIncognito ? 'pt-10' : ''}>
          <ProfileDetails
            profile={profile}
            userId={user.id}
            email={user.email}
            onBack={() => setCurrentView('profile')}
            onAccountDeleted={async () => {
              // La cuenta ya no existe: se cierra la sesión local y se vuelve al inicio.
              try { await logout(); } catch { /* la sesión ya no es válida */ }
              setCurrentGroup(null);
              setCurrentView('main');
            }}
            onOpenGroups={() => openFromProfile('my-groups')}
            onSaved={async () => {
              await refreshSubscription();
              setProfileSaved(true);
              setCurrentView('profile');
            }}
            messagesButton={inlineMessagesButton}
          />
        </div>
      </>
    );
  }

  if (currentView === 'team-creation' && user) {
    return withMessages(
      <>
        <IncognitoWarning />
        <div className={isIncognito ? 'pt-10' : ''}>
          <TeamCreation
            userId={user.id}
            onBack={() => setCurrentView('main')}
            onTeamCreated={() => {
              refreshSubscription();
              setCurrentView('my-groups');
            }}
          />
        </div>
      </>
    );
  }

  if (currentView === 'pro-shop' && user) {
    // Sin grupo activo se muestra igualmente, con botón atrás, para no dejar al usuario atrapado.
    return withMessages(
      <>
        <IncognitoWarning />
        <div className={isIncognito ? 'pt-10' : ''}>
          <ProShop
            groupId={currentGroup?.id ?? ownedTeam?.id ?? null}
            groupName={currentGroup?.name ?? ownedTeam?.name}
            userId={user.id}
            onBack={() => setCurrentView('profile')}
            onPurchaseComplete={() => setCurrentView('profile')}
            messagesButton={inlineMessagesButton}
          />
        </div>
      </>
    );
  }

  if (currentView === 'auth') {
    return (
      <>
        <IncognitoWarning />
        <div className={isIncognito ? 'pt-10' : ''}>
          <Auth backDestination={authReturnView === 'main' ? 'home' : 'back'}
            onShowPlans={() => { setReturnToProfile(false); setPlansContext('default'); setCurrentView('plans'); }}
            onAuthSuccess={async () => {
              setSimulatorEnabled(false);
              setSimulatedPlan(null);
              setAuthReturnView('main');
              const { data: { user: signedIn } } = await supabase.auth.getUser();
              setCurrentView(playerIntent(signedIn?.user_metadata || {}) && signedIn?.user_metadata.player_checkout_acknowledged !== playerIntent(signedIn?.user_metadata || {})?.id ? 'player-checkout' : 'main');
            }}
            onBack={() => {
              setCurrentView(authReturnView);
              setAuthReturnView('main');
            }}
          />

        </div>
      </>
    );
  }

  if (currentView === 'my-groups') {
    return withMessages(
      <>
        <IncognitoWarning />
        <div className={isIncognito ? 'pt-10' : ''}>
          <MyGroups backDestination={returnToProfile ? 'back' : 'home'}
            onBack={() => backFromProfileSection('main')}
            onGroupArchived={(groupId, archivedAt) => {
              setOwnedTeam(current => current?.id === groupId ? null : current);
              setCurrentGroup(current => current?.id === groupId ? { ...current, archived_at: archivedAt } : current);
            }}
            onGroupDeleted={(groupId) => {
              setOwnedTeam(current => current?.id === groupId ? null : current);
              setCurrentGroup(current => {
                if (current?.id !== groupId) return current;
                storageUtils.clearCurrentGroup();
                return null;
              });
              void refreshGroupMembership();
            }}
            onGroupSelected={(group) => {
              setReturnToProfile(false);
              void handleGroupJoined(group);
            }}
            messagesButton={inlineMessagesButton}
          />
        </div>
      </>
    );
  }

  if (!currentGroup && currentView === 'main') {
    return withMessages(
      <>
        <IncognitoWarning />
        <div className={isIncognito ? 'pt-10' : ''}>
          <HomeScreen
            planType={activePlanType}
            isAuthenticated={!!user}
            profile={profile}
            onQuickPlay={() => setCurrentView('setup')}
            onJoinQuickPlay={() => {
              setPendingRoundId(null);
              setShowAccessCodeModal(true);
              setAccessCodeError('');
            }}
            teamName={ownedTeam?.name || ownedTeam?.group_code}
            onCreateTeam={() => ownedTeam ? void handleGroupJoined(ownedTeam) : setCurrentView('team-creation')}
            onShowProfile={() => setCurrentView('profile')}
            onShowAuth={() => { setReturnToProfile(false); setPlansContext('default'); setCurrentView('plans'); }}
            onShowShare={() => setShowShareModal(true)}
            simulatorEnabled={simulatorEnabled}
            simulatorUpdating={simulatorUpdating}
            onToggleSimulator={handleToggleSimulator}
            onCycleSimulatorPlan={handleCycleSimulatorPlan}
            messagesButton={inlineMessagesButton}
          />
          {showAccessCodeModal && (
            <AccessCodeModal
              onSubmit={handleAccessCodeSubmit}
              onCancel={handleAccessCodeCancel}
              error={accessCodeError}
              loading={loading}
            />
          )}
          {showShareModal && (
            <ShareModal onClose={() => setShowShareModal(false)} />
          )}
          {showPayment && user && (
            <PaymentSelector
              isOpen={showPayment}
              onClose={() => setShowPayment(false)}
              planType={activePlanType}
              userId={user.id}
              amount={paymentAmount}
              description={paymentDescription}
              onSuccess={() => {
                refreshSubscription();
                setShowPayment(false);
              }}
            />
          )}
        </div>
      </>
    );
  }

  return withMessages(
    <div className="min-h-screen bg-app">
      <IncognitoWarning />
      {!user && !['active-rounds', 'quickplay-statistics', 'scorecard', 'leaderboard'].includes(currentView) && <GlobalThemeSwitch />}
      <div className={isIncognito ? 'pt-10' : ''}>
      {currentView === 'main' && currentGroup && (
        <RoundSetup
          onRoundCreated={handleRoundCreated}
          onViewActiveRounds={() => setCurrentView('active-rounds')}
          onViewGamePoints={() => setCurrentView('game-points')}
          onViewStatistics={() => setCurrentView('statistics')}
          onJoinWithCode={() => {
            setPendingRoundId(null);
            setShowAccessCodeModal(true);
            setAccessCodeError('');
          }}
          onLeaveGroup={handleLeaveGroup}
          onBack={currentGroup.archived_at ? () => {
            void golfService.leaveGroup();
            setCurrentGroup(null);
            setIsGroupCreator(false);
            setHasLimitedAccess(false);
            setCurrentView('my-groups');
          } : undefined}
          currentGroup={currentGroup}
          isGroupCreator={isGroupCreator}
          hasLimitedAccess={hasLimitedAccess}
          planType={activePlanType}
          onShowPlans={() => { setPlansContext('default'); setCurrentView('plans'); }}
          messagesButton={inlineMessagesButton}
        />
      )}

      {currentView === 'setup' && !currentGroup && (
        <RoundSetup
          onRoundCreated={handleRoundCreated}
          onViewActiveRounds={() => setCurrentView('active-rounds')}
          onViewGamePoints={() => setCurrentView('game-points')}
          onViewStatistics={() => setCurrentView('quickplay-statistics')}
          onJoinWithCode={() => {
            setPendingRoundId(null);
            setShowAccessCodeModal(true);
            setAccessCodeError('');
          }}
          onLeaveGroup={() => {}}
          onBack={() => setCurrentView('main')}
          currentGroup={null}
          planType={activePlanType}
          onShowPlans={(context) => { setPlansContext(context || 'default'); setCurrentView('plans'); }}
          messagesButton={inlineMessagesButton}
        />
      )}

      {currentView === 'players' && roundState.round && (
        <>
          {showHoleConfig && (
            <HoleConfiguration
              holes={roundState.holes}
              onHolesUpdated={handleHolesUpdated}
              onClose={() => setShowHoleConfig(false)}
              editable={roundState.isCreator && !readOnly}
            />
          )}
          <PlayerSetup backDestination={currentGroup ? 'home' : 'back'}
            messagesButton={inlineMessagesButton}
            roundId={roundState.round.id}
            players={roundState.players}
            useSlope={roundState.round.use_slope}
            numHoles={roundState.round.num_holes}
            courseId={roundState.round.course_id}
            accessCode={roundState.round.access_code}
            hasEditAccess={roundState.hasEditAccess && !readOnly}
            currentGroup={currentGroup}
            gameMode={roundState.round.game_mode}
            onPlayersUpdated={handlePlayersUpdated}
            onStartRound={handleStartRound}
            onSaveAndReturn={() => setCurrentView('main')}
            onOpenHoleConfig={() => setShowHoleConfig(true)}
            onHolesChanged={handleHolesChanged}
            onBack={handleBackToMain}
            loading={loading}
            account={user && profile && roundState.isCreator
              ? { userId: user.id, nick: profile.nick, displayName: profile.display_name, handicap: profile.exact_handicap ?? 0 }
              : null}
          />
        </>
      )}

      {currentView === 'scorecard' && roundState.round && (
        <Scorecard backDestination={currentGroup ? 'home' : 'back'}
          holes={roundState.holes}
          players={roundState.players}
          rounds={roundState.players.map((player) => ({
            playerId: player.id,
            scores: Object.fromEntries(
              roundState.scores
                .filter((s) => s.player_id === player.id)
                .map((s) => [s.hole_number, s])
            ),
            totalStablefordPoints: roundState.scores
              .filter((s) => s.player_id === player.id)
              .reduce((sum, s) => sum + s.stableford_points, 0),
          }))}
          currentHole={roundState.currentHole}
          numHoles={roundState.round.num_holes}
          roundId={roundState.round.id}
          courseId={roundState.round.course_id}
          accessCode={roundState.round.access_code}
          hasEditAccess={roundState.hasEditAccess && !readOnly}
          isCreator={roundState.isCreator}
          canFinishRound={roundState.isCreator}
          isRoundFinished={roundState.round.status === 'completed' || roundState.round.status === 'archived'}
          courseName={roundState.courseName}
          groupCode={currentGroup?.group_code}
          hoyo19Enabled={currentGroup?.group_code === 'DIVEND' || !!currentGroup?.hoyo_19_enabled}
          gameMode={roundState.round.game_mode}
          decidedResult={roundState.round.decided_result}
          onHoleChange={handleHoleChange}
          onScoreChange={handleScoreChange}
          onShowLeaderboard={() => setCurrentView('leaderboard')}
          onResetGame={handleBackToMain}
          onFinishRound={handleFinishRound}
          onCourseChanged={handleCourseChanged}
          messagesButton={inlineMessagesButton}
        />
      )}

      {currentView === 'leaderboard' && roundState.round && (
        <Leaderboard backDestination={'back'}
          players={roundState.players}
          rounds={roundState.players.map((player) => ({
            playerId: player.id,
            scores: Object.fromEntries(
              roundState.scores
                .filter((s) => s.player_id === player.id)
                .map((s) => [s.hole_number, s])
            ),
            totalStablefordPoints: roundState.scores
              .filter((s) => s.player_id === player.id)
              .reduce((sum, s) => sum + s.stableford_points, 0),
          }))}
          currentHole={roundState.holes[roundState.currentHole - 1]?.hole_number ?? roundState.currentHole}
          onBack={() => setCurrentView('scorecard')}
          hasGroup={!!currentGroup}
          groupId={currentGroup?.id ?? null}
          gameMode={roundState.round.game_mode}
          messagesButton={inlineMessagesButton}
        />
      )}

      {currentView === 'active-rounds' && (
        <ActiveRoundsViewer backDestination="back"
          onBack={() => backFromProfileSection(currentGroup ? 'main' : 'setup')}
          onJoinRound={handleJoinRound}
          currentGroup={currentGroup}
          messagesButton={inlineMessagesButton}
        />
      )}

      {currentView === 'game-points' && (
        <GamePoints groupId={currentGroup?.id} onBack={() => setCurrentView('main')} messagesButton={inlineMessagesButton} />
      )}

      {currentView === 'statistics' && currentGroup && (
        <Suspense fallback={<p role="status" className="p-6 text-center text-ink">Cargando estadísticas…</p>}><Statistics backDestination="back"
          onBack={() => backFromProfileSection('main')}
          currentGroup={currentGroup}
          messagesButton={inlineMessagesButton}
        /></Suspense>
      )}

      {currentView === 'quickplay-statistics' && !currentGroup && (
        <Suspense fallback={<p role="status" className="p-6 text-center text-ink">Cargando estadísticas…</p>}><QuickPlayStatistics
          roundId={roundState.round?.id}
          sharedRoundData={sharedExpressStats}
          onBack={() => {
            setSharedExpressStats(null);
            backFromProfileSection('setup');
          }}
          messagesButton={sharedExpressStats ? undefined : inlineMessagesButton}
        /></Suspense>
      )}



      {showAccessCodeModal && (
        <AccessCodeModal
          onSubmit={handleAccessCodeSubmit}
          onCancel={handleAccessCodeCancel}
          error={accessCodeError}
          loading={loading}
        />
      )}

      {showLeaveGroupConfirm && (
        <ConfirmModal
          message="¿Seguro que deseas salir del grupo? Tendrás que volver a unirte con el código del grupo."
          readOnlySensitive={false}
          onConfirm={handleConfirmLeaveGroup}
          onCancel={handleCancelLeaveGroup}
        />
      )}

      {currentView === 'viewer' && roundState.round && !roundState.isCreator && (
        <div className="min-h-screen bg-app p-4 md:p-8">
          <div className="max-w-2xl mx-auto">
            <div className="bg-card rounded-lg shadow-card p-6 md:p-8 text-center">
              <h1 className="text-3xl font-bold text-title mb-4">Observando Partida</h1>
              <p className="text-ink-3 mb-6">
                Estás viendo esta partida como observador. Solo el creador puede editar puntuaciones.
              </p>
              <Leaderboard backDestination={currentGroup ? 'home' : 'back'}
                players={roundState.players}
                rounds={roundState.players.map((player) => ({
                  playerId: player.id,
                  scores: Object.fromEntries(
                    roundState.scores
                      .filter((s) => s.player_id === player.id)
                      .map((s) => [s.hole_number, s])
                  ),
                  totalStablefordPoints: roundState.scores
                    .filter((s) => s.player_id === player.id)
                    .reduce((sum, s) => sum + s.stableford_points, 0),
                }))}
                currentHole={roundState.holes[roundState.currentHole - 1]?.hole_number ?? roundState.currentHole}
                onBack={handleBackToMain}
                hasGroup={!!currentGroup}
                groupId={currentGroup?.id ?? null}
                gameMode={roundState.round.game_mode}
              />
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

export default App;
