import { supabase } from './services/supabaseClient';
import { useNotificationCount } from './hooks/useNotificationCount';
import { useReadOnly } from './context/ReadOnlyContext';
import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { GolfRound, GolfHole, GolfCourse, RoundPlayer, RoundScore, Group, GameMode, PlanType } from './types';
import { golfService } from './services/golfService';
import { calculateModePoints, ModeScoreInput } from './utils/calculations';
import { accessCodeStorage } from './utils/accessCode';
import { storageUtils } from './utils/storage';
import { getUserId } from './utils/userId';
import { useAuth } from './context/AuthContext'; // 👈 Importación del AuthContext
import { RoundSetup } from './components/RoundSetup';
import { PlayerSetup } from './components/PlayerSetup';
import { Scorecard } from './components/Scorecard';
import { Leaderboard } from './components/Leaderboard';
import { ActiveRoundsViewer } from './components/ActiveRoundsViewer';
import { HoleConfiguration } from './components/HoleConfiguration';
import { GamePoints } from './components/GamePoints';
import { Statistics } from './components/Statistics';
import { QuickPlayStatistics } from './components/QuickPlayStatistics';
import { AccessCodeModal } from './components/AccessCodeModal';
import { ConfirmModal } from './components/ConfirmModal';
import GroupSetup from './components/GroupSetup';
import Auth from './components/Auth';
import MyGroups from './components/MyGroups';
import { PremiumModal } from './components/PremiumModal';
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

type ViewType = 'player-checkout' | 'main' | 'setup' | 'players' | 'scorecard' | 'leaderboard' | 'active-rounds' | 'viewer' | 'game-points' | 'statistics' | 'quickplay-statistics' | 'auth' | 'my-groups' | 'plans' | 'registration' | 'profile' | 'profile-details' | 'team-creation' | 'pro-shop';

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
  <div className="fixed right-3 top-3 z-[100]">
    <ThemeToggle />
  </div>
);

function App() {
  const readOnly = useReadOnly();
  const { user, logout } = useAuth(); // 👈 Usar el contexto global
  const [isIncognito, setIsIncognito] = useState(false);
  const [authUser, setAuthUser] = useState<any>(null);
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
  const [isGroupCreator, setIsGroupCreator] = useState(false);
  const [hasLimitedAccess, setHasLimitedAccess] = useState(false);
  const [groupLoading, setGroupLoading] = useState(true);
  const [currentView, setCurrentView] = useState<ViewType>('main');
  const [registrationPlan, setRegistrationPlan] = useState<PaidPlan>('player');
  const [registrationPeriod, setRegistrationPeriod] = useState<BillingPeriod>('annual');
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
  const [sharedExpressStats, setSharedExpressStats] = useState<any | null>(null);
  const [showLeaveGroupConfirm, setShowLeaveGroupConfirm] = useState(false);
  const { planType, profile, loading: subscriptionLoading, refresh: refreshSubscription } = useSubscription(user?.id ?? null);
  const activityScope = currentGroup
    ? { groupId: currentGroup.id }
    : { roundId: roundState.round?.group_id ? null : roundState.round?.id, accessCode: roundState.round?.id ? accessCodeStorage.getAccessCode(roundState.round.id) : null };
  const {count: pendingInvitations, refresh: refreshNotifications} = useNotificationCount(user?.id ?? null, currentView, activityScope);
  const handleNotificationsRefresh = useCallback(() => { void refreshNotifications(); }, [refreshNotifications]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentDescription, setPaymentDescription] = useState('');
  const [simulatorEnabled, setSimulatorEnabled] = useState(false);
  const [simulatedPlan, setSimulatedPlan] = useState<PlanType | null>(null);
  const [simulatorUpdating, setSimulatorUpdating] = useState(false);
  const [returnToProfile, setReturnToProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  // Paid access comes from the server-confirmed database subscription.
  const activePlanType = planType;

  const pendingPlayer = playerIntent(user?.user_metadata || {});
  const pendingPlayerId = pendingPlayer && user?.user_metadata.player_checkout_acknowledged !== pendingPlayer.id ? pendingPlayer.id : null;
  useEffect(() => {
    if (user && pendingPlayerId) {
      setEmailConfirmed(false);
      setCurrentView('player-checkout');
    }
  }, [user?.id, pendingPlayerId]);

  useEffect(() => {
    // Simulator state belongs to a single authenticated user. Keeping it when
    // switching accounts can make the next account display the previous plan.
    setSimulatorEnabled(false);
    setSimulatedPlan(null);
    setSimulatorUpdating(false);
  }, [user?.id]);

  useEffect(() => {
    if (currentView === 'my-groups' && !subscriptionLoading && activePlanType !== 'team' && activePlanType !== 'premium' && !readOnly) {
      setReturnToProfile(false);
      setCurrentView('main');
    }
  }, [activePlanType, currentView, subscriptionLoading, readOnly]);

  useEffect(() => {
    if (!profileSaved) return;
    const timeoutId = window.setTimeout(() => setProfileSaved(false), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [profileSaved]);

  useEffect(() => {
    const closeMessagesOnBack = () => setMessagesOpen(false);
    window.addEventListener('popstate', closeMessagesOnBack);
    return () => window.removeEventListener('popstate', closeMessagesOnBack);
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
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  }, [emailConfirmed]);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('stripe_checkout')) return;
    url.searchParams.delete('stripe_checkout');
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
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
  }, [authUser]);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        console.log('🔐 Listening auth changes...');
        const { supabase } = await import('./services/supabaseClient');
        console.log('✅ Supabase client imported');

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          console.log('No user authenticated');
          setAuthUser(null);
        } else {
          console.log('✅ User authenticated:', user.email);
          setAuthUser(user);
        }
        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
          console.log('🔄 Auth state change:', event);
          if (event === 'PASSWORD_RECOVERY') {
            setCurrentView('auth');
          } else if (event === 'SIGNED_IN') {
            setAuthUser(session?.user || null);
          } else if (event === 'SIGNED_OUT') {
            setAuthUser(null);
          }
        });

        return () => {
          authListener.subscription.unsubscribe();
        };
      } catch (error) {
        console.error('❌ Error in checkAuth:', error);
      }
    };
    checkAuth();
  }, []);

  useEffect(() => {
    const checkGroup = async () => {
      try {
        console.log('👥 Checking group...');
        const group = await golfService.getCurrentGroup();

        if (group) {
          console.log('✅ Group found:', group.group_code);
          const { getUserId } = await import('./utils/userId');
          const currentUserId = getUserId();
          const isCreator = group.group_code === 'DIVEND' || currentUserId === group.created_by;
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

  useEffect(() => {
    const restoreActiveRound = async () => {
      if (groupLoading) return;

      const activeRoundId = storageUtils.getActiveRoundId();
      if (activeRoundId && !roundState.round) {
        try {
          setLoading(true);
          const roundData = await golfService.getRoundWithDetails(activeRoundId);
          if (roundData) {
            const { getUserId } = await import('./utils/userId');
            const currentUserId = getUserId();

            const isCreator = currentUserId === roundData.round.user_id;
            const storedCode = accessCodeStorage.getAccessCode(activeRoundId);
            const hasEditAccess = isCreator || storedCode === roundData.round.access_code;

            if (!roundData.round.group_id && roundData.round.status !== 'active' && !isCreator) {
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
  }, [groupLoading]);

  useEffect(() => {
    if (!roundState.round || (currentView !== 'scorecard' && currentView !== 'leaderboard' && currentView !== 'players')) {
      return;
    }

    const scoresSubscription = golfService.subscribeToRoundScores(roundState.round.id, async () => {
      try {
        const scores = await golfService.getRoundScores(roundState.round!.id);
        setRoundState((prev) => ({
          ...prev,
          scores,
        }));
      } catch (err) {
        console.error('Error updating scores:', err);
      }
    });

    const playersSubscription = golfService.subscribeToRoundPlayers(roundState.round.id, async () => {
      try {
        const players = await golfService.getRoundPlayers(roundState.round!.id);
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
    if (!roundId || roundState.round?.group_id) return;
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
        if (data.status !== 'active' && data.user_id !== getUserId()) {
          accessCodeStorage.removeAccessCode(roundId);
          storageUtils.clearActiveRound();
          setRoundState(prev => prev.round?.id === roundId ? { ...prev, round: null, players: [], scores: [], hasEditAccess: false } : prev);
          setCurrentView('setup');
          return;
        }
        const edit = data.status === 'active' && (data.user_id === getUserId() || accessCodeStorage.getAccessCode(roundId) === data.access_code);
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
  }, [roundState.round?.id, roundState.round?.group_id]);

  const handleGroupCreated = async (group: Group) => {
    setCurrentGroup(group);
    setIsGroupCreator(true);
    setHasLimitedAccess(false);
    storageUtils.saveCurrentGroup(group.id, group.group_code, true, false);
  };

  const handleGroupJoined = async (group: Group) => {
    const { supabase } = await import('./services/supabaseClient');
    const { data: { user } } = await supabase.auth.getUser();

    let isCreator = false;
    if (user) {
      isCreator = group.group_code === 'DIVEND' || user.id === group.created_by;
    } else {
      const { getUserId } = await import('./utils/userId');
      const currentUserId = getUserId();
      isCreator = group.group_code === 'DIVEND' || currentUserId === group.created_by;
    }

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

  const handleRoundCreated = async (roundId: string, courseId: string, numHoles: 9 | 18, useSlope: boolean) => {
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
        setCurrentView('players');
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
        const { getUserId } = await import('./utils/userId');
        const currentUserId = getUserId();

        const isCreator = currentUserId === roundData.round.user_id;
        const storedCode = accessCodeStorage.getAccessCode(roundId);
        const hasEditAccess = isCreator || storedCode === roundData.round.access_code;

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
    if (currentGroup) {
      setCurrentView('main');
    } else {
      setCurrentView('scorecard');
    }
  };

  const handleHoleChange = (holeNumber: number) => {
    setRoundState((prev) => ({ ...prev, currentHole: holeNumber }));
  };

  const handleScoreChange = async (playerId: string, holeNumber: number, score: any) => {
    console.log('=== handleScoreChange llamado ===');

    if (!roundState.round) {
      console.log('No hay round activo');
      return;
    }

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
      const stablefordPoints = score.stablefordPoints ?? score.stableford_points;
      const noPasoRojas = score.no_paso_rojas ?? false;
      const spanishHands = score.spanish_hands ?? false;
      const abandoned = score.abandoned ?? false;
      const modePoints = score.mode_points ?? 0;

      await golfService.recordScore(
        roundState.round.id,
        playerId,
        holeNumber,
        grossStrokes,
        strokesReceived,
        netStrokes,
        stablefordPoints,
        noPasoRojas,
        spanishHands,
        abandoned,
        modePoints
      );

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
            await golfService.recordScore(
              roundState.round.id,
              existing.player_id,
              holeNumber,
              existing.gross_strokes,
              existing.strokes_received,
              existing.net_strokes,
              existing.stableford_points,
              existing.no_paso_rojas,
              existing.spanish_hands ?? false,
              existing.abandoned,
              newModePoints
            );
            updatedOtherScores.push({
              ...existing,
              mode_points: newModePoints,
              updated_at: new Date().toISOString(),
            });
          }
        }
      }

      setRoundState((prev) => ({
        ...prev,
        scores: [
          ...prev.scores.filter((s) => !(s.hole_number === holeNumber && s.player_id === playerId)),
          ...updatedOtherScores,
          {
            id: `score_${Date.now()}`,
            round_id: roundState.round!.id,
            player_id: playerId,
            hole_number: holeNumber,
            gross_strokes: grossStrokes,
            strokes_received: strokesReceived,
            net_strokes: netStrokes,
            stableford_points: stablefordPoints,
            no_paso_rojas: noPasoRojas,
            spanish_hands: spanishHands,
            abandoned: abandoned,
            mode_points: modePoints,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      }));
    } catch (err) {
      console.error('Error recording score:', err);
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
        const round = await golfService.getRoundByAccessCode(code, currentGroup?.id);

        if (round) {
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
      if (isQuickPlay) await golfService.finishExpressRound(roundState.round.id);
      else await golfService.updateRoundStatus(roundState.round.id, 'completed');
      storageUtils.clearActiveRound();

      if (isQuickPlay) {
        if (roundState.isCreator) setCurrentView('quickplay-statistics');
        else {
          accessCodeStorage.removeAccessCode(roundState.round.id);
          setRoundState(prev => ({ ...prev, round: null, players: [], scores: [], hasEditAccess: false }));
          setCurrentView('setup');
        }
      } else if (currentGroup) {
        setCurrentView('statistics');
      } else {
        setCurrentView('setup');
      }
    } catch (err) {
      console.error('Error al finalizar la partida:', err);
      setError('Error al finalizar la partida');
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

  const usesInlineMessages = currentView === 'main' || currentView === 'setup' || currentView === 'scorecard' || currentView === 'quickplay-statistics';
  const inlineMessagesButton = <GlobalMessagesButton count={pendingInvitations} onClick={openMessages} variant="inline" />;
  const withMessages = (content: React.ReactNode) => <>
    {!usesInlineMessages && <GlobalMessagesButton count={pendingInvitations} onClick={openMessages} belowWarning={isIncognito} />}
    {messagesOpen && <NotificationsBell
      key={`${user?.id || 'express'}-${activityScope.groupId || activityScope.roundId || 'general'}`}
      userId={user?.id ?? null}
      activityScope={activityScope}
      onBack={closeMessages}
      onInvitationResolved={handleNotificationsRefresh}
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
            onBack={() => backFromProfileSection('main')}
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
            onShowAuth={user ? undefined : () => openAuth('plans')}
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

  if (groupLoading) {
    return (
      <>
        <IncognitoWarning />
        {!user && <GlobalThemeSwitch />}
        <div className={`min-h-screen bg-app flex items-center justify-center ${isIncognito ? 'pt-10' : ''}`}>
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-accent mx-auto mb-4"></div>
            <p className="text-ink-3">Cargando...</p>
          </div>
        </div>
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
            onShowStats={() => openFromProfile(currentGroup ? 'statistics' : 'quickplay-statistics')}
            onShowHistory={() => openFromProfile('active-rounds')}
            onShowUpgrade={() => openFromProfile('plans')}
            onShowProShop={() => setCurrentView('pro-shop')}
            onShowGroups={() => openFromProfile('my-groups')}
            onShowSettings={() => setCurrentView('profile-details')}
          />
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
            onSaved={async () => {
              await refreshSubscription();
              setProfileSaved(true);
              setCurrentView('profile');
            }}
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
            onTeamCreated={(groupId) => {
              refreshSubscription();
              setCurrentView('my-groups');
            }}
          />
        </div>
      </>
    );
  }

  if (currentView === 'pro-shop' && currentGroup && user) {
    return (
      <>
        <IncognitoWarning />
        {!user && <GlobalThemeSwitch />}
        <div className={isIncognito ? 'pt-10' : ''}>
          <ProShop
            groupId={currentGroup.id}
            userId={user.id}
            onBack={() => setCurrentView('profile')}
            onPurchaseComplete={() => setCurrentView('profile')}
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
            onShowPlans={() => { setReturnToProfile(false); setCurrentView('plans'); }}
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
            onGroupSelected={(group) => {
              setReturnToProfile(false);
              void handleGroupJoined(group);
            }}
            onLogout={async () => {
              await logout(); // 👈 Uso de logout global
              setReturnToProfile(false);
              setCurrentView('main');
            }}
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
            onCreateTeam={() => setCurrentView('team-creation')}
            onShowProfile={() => setCurrentView('profile')}
            onShowAuth={() => { setReturnToProfile(false); setCurrentView('plans'); }}
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
      {!user && <GlobalThemeSwitch />}
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
          currentGroup={currentGroup}
          isGroupCreator={isGroupCreator}
          hasLimitedAccess={hasLimitedAccess}
          planType={activePlanType}
          onShowPlans={() => setCurrentView('plans')}
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
          onShowPlans={() => setCurrentView('plans')}
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
            onOpenHoleConfig={() => setShowHoleConfig(true)}
            onHolesChanged={handleHolesChanged}
            onBack={handleBackToMain}
            loading={loading}
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
          canFinishRound={!!roundState.round.group_id || roundState.isCreator || roundState.round.responsible_user_id === getUserId()}
          currentResponsibleUserId={roundState.round.responsible_user_id}
          courseName={roundState.courseName}
          groupCode={currentGroup?.group_code}
          gameMode={roundState.round.game_mode}
          onHoleChange={handleHoleChange}
          onScoreChange={handleScoreChange}
          onShowLeaderboard={() => setCurrentView('leaderboard')}
          onResetGame={handleBackToMain}
          onFinishRound={handleFinishRound}
          onResponsibleChanged={async (responsibleUserId) => {
            if (!roundState.round) return;
            await golfService.setExpressRoundResponsible(roundState.round.id, responsibleUserId);
            setRoundState(prev => ({
              ...prev,
              round: prev.round ? { ...prev.round, responsible_user_id: responsibleUserId } : null,
            }));
          }}
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
          currentHole={roundState.currentHole}
          onBack={() => setCurrentView('scorecard')}
          hasGroup={!!currentGroup}
          gameMode={roundState.round.game_mode}
        />
      )}

      {currentView === 'active-rounds' && (
        <ActiveRoundsViewer backDestination={!returnToProfile && currentGroup ? 'home' : 'back'}
          onBack={() => backFromProfileSection(currentGroup ? 'main' : 'setup')}
          onJoinRound={handleJoinRound}
          currentGroup={currentGroup}
        />
      )}

      {currentView === 'game-points' && (
        <GamePoints groupId={currentGroup?.id} onBack={() => setCurrentView('main')} />
      )}

      {currentView === 'statistics' && currentGroup && (
        <Statistics backDestination={returnToProfile ? 'back' : 'home'}
          onBack={() => backFromProfileSection('main')}
          currentGroup={currentGroup}
        />
      )}

      {currentView === 'quickplay-statistics' && !currentGroup && (
        <QuickPlayStatistics
          roundId={roundState.round?.id}
          sharedRoundData={sharedExpressStats}
          onBack={() => {
            setSharedExpressStats(null);
            backFromProfileSection('setup');
          }}
          messagesButton={sharedExpressStats ? undefined : inlineMessagesButton}
        />
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
                currentHole={roundState.currentHole}
                onBack={handleBackToMain}
                hasGroup={!!currentGroup}
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
