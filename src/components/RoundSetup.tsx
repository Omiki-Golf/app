import { WriteButton } from '../context/ReadOnlyContext';
import { NavigationButton } from './NavigationButton';
import React, { useState, useEffect } from 'react';
import { GolfCourse, GolfHole, Group, GameMode } from '../types';
import { golfService } from '../services/golfService';
import { ChevronRight, Copy, Check, LogOut, Info, Lock } from 'lucide-react';
import { HolesRangeModal } from './HolesRangeModal';
import { AdminPinModal } from './AdminPinModal';
import { adminPinUtils } from '../utils/adminPin';
import { useTranslation } from 'react-i18next';
import { safeStorage } from '../utils/safeStorage';
import { MAX_EXPRESS_GAMES } from '../services/expressTierGuard';
import { ParTeeUpgradeModal } from './ParTeeUpgradeModal';
import { trackExpressGameCreated } from '../services/expressTierGuard';
import { supabase } from '../services/supabaseClient';
import { getUserId } from '../utils/userId';
import { CourseCatalogPicker } from './CourseCatalogPicker';

interface RoundSetupProps {
  onRoundCreated: (roundId: string, courseId: string, numHoles: 9 | 18, useSlope: boolean) => void;
  onViewActiveRounds: () => void;
  onViewGamePoints: () => void;
  onViewStatistics?: () => void;
  onJoinWithCode: () => void;
  onLeaveGroup: () => void;
  onBack?: () => void;
  currentGroup?: Group | null;
  isGroupCreator?: boolean;
  hasLimitedAccess?: boolean;
  planType?: 'express' | 'player' | 'team' | 'premium';
  onShowPlans?: (context?: 'express-limit') => void;
  messagesButton?: React.ReactNode;
}

export const RoundSetup: React.FC<RoundSetupProps> = ({
  onRoundCreated,
  onViewActiveRounds,
  onViewGamePoints,
  onViewStatistics,
  onJoinWithCode,
  onLeaveGroup,
  onBack,
  currentGroup,
  isGroupCreator = true,
  hasLimitedAccess = false,
  planType = 'express',
  onShowPlans,
  messagesButton,
}) => {
  const { t } = useTranslation();
  const isExpress = planType === 'express';
  const handleGameModeClick = (mode: GameMode) => {
    if (isExpress && mode !== 'stableford') {
      setShowUpgradeModal(true);
      return;
    }
    setGameMode(mode);
  };
  const [courses, setCourses] = useState<GolfCourse[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [selectedCourseName, setSelectedCourseName] = useState<string>('');
  const [selectedCourseHoleCount, setSelectedCourseHoleCount] = useState<number>(18);
  const [numHoles, setNumHoles] = useState<9 | 18>(9);
  const [holesRange, setHolesRange] = useState<'1-9' | '10-18'>('1-9');
  const useSlope = false;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeRoundsCount, setActiveRoundsCount] = useState(0);
  const [codeCopied, setCodeCopied] = useState(false);
  const [showHolesRangeModal, setShowHolesRangeModal] = useState(false);
  const [pendingNumHoles, setPendingNumHoles] = useState<9 | 18 | null>(null);
  const [showAdminPinModal, setShowAdminPinModal] = useState(false);
  const [pinError, setPinError] = useState('');
  const [completedRounds, setCompletedRounds] = useState<any[]>([]);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [gameMode, setGameMode] = useState<GameMode>('stableford');
  const [completedRoundsCount, setCompletedRoundsCount] = useState<number>(0);

  const [quickPlayRoundsCount, setQuickPlayRoundsCount] = useState<number | null>(null);

  useEffect(() => {
    loadCourses();
    loadActiveRoundsCount();
    loadCompletedRounds();
    loadQuickPlayRoundsCount();
  }, []);

  useEffect(() => {
    const refreshCount = () => { void loadQuickPlayRoundsCount(); };
    const timer = window.setInterval(refreshCount, 30000);
    window.addEventListener('focus', refreshCount);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refreshCount); };
  }, [currentGroup]);

  const loadQuickPlayRoundsCount = async () => {
    if (!currentGroup) {
      try {
        const count = await golfService.countQuickRounds();
        setQuickPlayRoundsCount(count);
      } catch (err) {
        console.error('Error al contar partidas rápidas:', err);
      }
    }
  };

  useEffect(() => {
    const loadCourseDetails = async () => {
      if (selectedCourse) {
        try {
          const holeCount = await golfService.getCourseHoleCount(selectedCourse);
          setSelectedCourseHoleCount(holeCount);

          const course = courses.find(c => c.id === selectedCourse);
          if (course) {
            setSelectedCourseName(course.name);
          }

          if (holeCount === 9) {
            setNumHoles(9);
          }

        } catch (err) {
          console.error('Error loading course details:', err);
        }
      }
    };

    loadCourseDetails();
  }, [selectedCourse, courses]);

  const loadCourses = async () => {
    try {
      setLoading(true);
      const data = await golfService.getCourses();
      setCourses(data);
      if (data.length > 0) {
        const lastCourseId = safeStorage.getItem('lastSelectedCourse');
        const courseExists = lastCourseId && data.some(c => c.id === lastCourseId);
        setSelectedCourse(courseExists ? lastCourseId : data[0].id);
      }
    } catch (err) {
      setError(t('roundSetup.errors.courses'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadActiveRoundsCount = async () => {
    try {
      const activeRounds = await golfService.getActiveRounds();
      setActiveRoundsCount(activeRounds.length);
    } catch (err) {
      console.error('Error cargando contador de partidas:', err);
    }
  };

  const loadCompletedRounds = async () => {
    try {
      if (!currentGroup) {
        const availableRounds = await golfService.getAvailableRoundsForStats(4);
        console.log('📊 Partidas encontradas para estadísticas:', availableRounds);
        setCompletedRounds(availableRounds);
      }
    } catch (err) {
      console.error('Error cargando partidas para estadísticas:', err);
    }
  };

  const handleCreateRound = async () => {
    const isGroupRound = Boolean(currentGroup?.id || currentGroup?.group_code);

    if (!isGroupRound) {
      try {
        setLoading(true);

        if (isExpress) {
          const existingCount = await golfService.countQuickRounds();
          if (existingCount >= MAX_EXPRESS_GAMES) {
            setError(t('roundSetup.errors.expressLimit'));
            window.scrollTo({ top: 0, behavior: 'smooth' });
            if (onShowPlans) onShowPlans('express-limit');
            else setShowUpgradeModal(true);
            return;
          }
        }

        const hasActive = await golfService.hasActiveQuickPlayRound();
        if (hasActive) {
          setError(t('roundSetup.errors.active'));
          window.scrollTo({ top: 0, behavior: 'smooth' });
          setLoading(false);
          return;
        }

        const hasCompleted = await golfService.hasCompletedQuickPlayRound();
        if (hasCompleted) {
          setError(t('roundSetup.errors.archive'));
          window.scrollTo({ top: 0, behavior: 'smooth' });
          setLoading(false);
          return;
        }

      } catch (err) {
        console.error('Error al comprobar el estado de las partidas:', err);
      } finally {
        setLoading(false);
      }
    }

    if (!selectedCourse) {
      setError(t('roundSetup.errors.selectCourse'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (currentGroup?.group_code === 'DIVEND' && !adminPinUtils.isAuthorized()) {
      setShowAdminPinModal(true);
      setPinError('');
      return;
    }

    await proceedWithRoundCreation();
  };

  const proceedWithRoundCreation = async () => {
    if (!selectedCourse) return;
    try {
      setLoading(true);
      setError('');
      console.log('🚀 Iniciando creación de partida en golfService...');
      const round = await golfService.createRound(
        selectedCourse,
        numHoles,
        useSlope,
        numHoles === 9 ? holesRange : undefined,
        undefined,
        gameMode
      );

      if (isExpress && !currentGroup) {
        trackExpressGameCreated(round.id);
      }

      safeStorage.setItem('lastSelectedCourse', selectedCourse);
      onRoundCreated(round.id, round.course_id, round.num_holes, round.use_slope);
    } catch (err: any) {
      console.error('Error al crear la partida:', err);
      setError(err.message || t('roundSetup.errors.create'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyGroupCode = async () => {
    if (!currentGroup) return;

    try {
      await navigator.clipboard.writeText(currentGroup.group_code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch (err) {
      console.error('Error copying code:', err);
    }
  };

  const handleNumHolesChange = (newNumHoles: 9 | 18) => {
    if (newNumHoles === 9 && selectedCourseHoleCount === 18) {
      const isCostaAzahar = selectedCourseName.includes('Costa Azahar');

      if (isCostaAzahar) {
        setNumHoles(9);
        setHolesRange('1-9');
      } else {
        setPendingNumHoles(newNumHoles);
        setShowHolesRangeModal(true);
      }
    } else {
      setNumHoles(newNumHoles);
      setHolesRange('1-9');
    }
  };

  const handleHolesRangeConfirm = (range: '1-9' | '10-18') => {
    setHolesRange(range);
    if (pendingNumHoles !== null) {
      setNumHoles(pendingNumHoles);
      setPendingNumHoles(null);
    }
    setShowHolesRangeModal(false);
  };

  const handleHolesRangeCancel = () => {
    setPendingNumHoles(null);
    setShowHolesRangeModal(false);
  };

  const handleAdminPinSubmit = (pin: string) => {
    if (adminPinUtils.verifyPin(pin)) {
      adminPinUtils.setAuthorized();
      setShowAdminPinModal(false);
      setPinError('');
      proceedWithRoundCreation();
    } else {
      setPinError(t('roundSetup.errors.pin'));
    }
  };

  const handleAdminPinCancel = () => {
    setShowAdminPinModal(false);
    setPinError('');
  };

  return (
    <div className="min-h-screen bg-app p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        {((!currentGroup && onBack) || messagesButton) && (
          <div className="grid grid-cols-3 items-center">
            <div>{!currentGroup && onBack && <NavigationButton destination="home" onClick={onBack} />}</div>
            <div className="flex justify-center">{messagesButton}</div>
            <div />
          </div>
        )}
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <h1 className="text-4xl md:text-5xl font-bold text-title">
              {currentGroup?.group_code === 'DIVEND'
                ? 'Partideta dels divendres'
                : (currentGroup?.name || 'OmkiGolf')}
            </h1>
          </div>
          <p className="text-accent-ink text-lg">
            {currentGroup ? t('roundSetup.manager') : t('roundSetup.quick')}
          </p>
        </div>

        {/* Express tiene cupo; Player y Team muestran solo el total. */}
        {!currentGroup && quickPlayRoundsCount !== null && !isExpress && (
          <div className="bg-card border border-line rounded-xl p-4 text-ink-2 flex items-center gap-3 shadow-card">
            <Info className="text-accent-ink flex-shrink-0" size={24} />
            <p className="text-sm">{t('roundSetup.played', { count: quickPlayRoundsCount })}</p>
          </div>
        )}

        {/* Código de Grupo */}
        {currentGroup && !hasLimitedAccess && (
          <div className="bg-card rounded-lg shadow-card p-6">
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-lg font-semibold text-ink">{t('roundSetup.groupCode')}</h3>
              <button
                onClick={onLeaveGroup}
                className="text-red-600 hover:text-red-700 flex items-center gap-1 text-sm font-medium transition-colors"
                title={t('roundSetup.leaveGroup')}
              >
                <LogOut size={16} />
                {t('roundSetup.leave')}
              </button>
            </div>
            <p className="text-sm text-ink-3 mb-3">
              {t('roundSetup.shareCode')}
            </p>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-accent-soft border-2 border-green-300 rounded-lg px-4 py-3 text-center">
                <span className="text-2xl font-mono font-bold text-accent-ink tracking-wider">
                  {currentGroup.group_code}
                </span>
              </div>
              <button
                onClick={handleCopyGroupCode}
                className="bg-accent hover:bg-accent-hover text-on-accent p-3 rounded-lg transition-colors"
                title={t('groups.copyCode')}
              >
                {codeCopied ? <Check size={24} /> : <Copy size={24} />}
              </button>
            </div>
            {currentGroup.name && (
              <p className="text-sm text-ink-3 mt-2">{t('roundSetup.group', { name: currentGroup.name })}</p>
            )}
          </div>
        )}

        {/* Unirse con Código */}
        {currentGroup && !hasLimitedAccess && (
          <div
            onClick={onJoinWithCode}
            className="bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-300 rounded-lg shadow-card p-6 md:p-8 cursor-pointer hover:shadow-xl transition-shadow"
          >
            <h2 className="text-2xl font-bold text-purple-900 mb-4">{t('roundSetup.joinTitle')}</h2>
            <p className="text-ink-2 mb-6">
              {t('roundSetup.joinDescription')}
            </p>
            <button className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-lg flex items-center justify-center gap-2 transition-colors">
              {t('roundSetup.enterCode')}
              <ChevronRight size={20} />
            </button>
          </div>
        )}

        {/* Salir del Grupo */}
        {currentGroup && hasLimitedAccess && (
          <button
            onClick={onLeaveGroup}
            className="w-full text-left bg-card hover:bg-card-2 border border-line rounded-lg p-3 flex items-center justify-between text-sm text-ink-3 hover:text-red-600 transition-colors"
          >
            <span className="flex items-center gap-2">
              <LogOut size={16} />
              {t('roundSetup.leaveGroup')}
            </span>
          </button>
        )}

        <div className={`grid grid-cols-1 ${(isGroupCreator && !hasLimitedAccess) ? 'md:grid-cols-2 md:items-stretch' : ''} gap-4`}>
          {/* Nueva Partida */}
          {isGroupCreator && !hasLimitedAccess && (
            <div className="bg-card rounded-lg shadow-card p-6 md:p-8">
              <h2 className="text-2xl font-bold text-title mb-6">{t('roundSetup.newRound')}</h2>

              {error && (
                <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded mb-4">
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-ink-2 mb-2">
                    {t('roundSetup.selectCourse')}
                  </label>
                  <CourseCatalogPicker
                    courses={courses}
                    selectedCourseId={selectedCourse}
                    onSelect={setSelectedCourse}
                    onUnavailable={() => {
                      setError('Este recorrido todavía no está incorporado a la base de datos.');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-ink-2 mb-3">
                    {t('roundSetup.holes')}
                  </label>
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleNumHolesChange(9)}
                      className={`flex-1 py-3 rounded-lg font-bold transition-all ${
                        numHoles === 9
                          ? 'bg-accent text-on-accent shadow-card'
                          : 'bg-neutral text-ink hover:bg-neutral-hover'
                      }`}
                    >
                      {t('roundSetup.holesCount', { count: 9 })}
                    </button>
                    <button
                      onClick={() => handleNumHolesChange(18)}
                      className={`flex-1 py-3 rounded-lg font-bold transition-all ${
                        numHoles === 18
                          ? 'bg-accent text-on-accent shadow-card'
                          : 'bg-neutral text-ink hover:bg-neutral-hover'
                      }`}
                    >
                      {t('roundSetup.holesCount', { count: 18 })}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-ink-2 mb-3">
                    {t('roundSetup.gameMode')}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleGameModeClick('stableford')}
                      className={`py-3 px-4 rounded-lg font-bold transition-all text-sm ${
                        gameMode === 'stableford'
                          ? 'bg-accent text-on-accent shadow-card'
                          : 'bg-neutral text-ink hover:bg-neutral-hover'
                      }`}
                    >
                      Stableford
                    </button>
                    <button
                      onClick={() => handleGameModeClick('match')}
                      className={`relative py-3 px-4 rounded-lg font-bold transition-all text-sm ${
                        gameMode === 'match'
                          ? 'bg-accent text-on-accent shadow-card'
                          : 'bg-neutral text-ink hover:bg-neutral-hover'
                      } ${isExpress ? 'opacity-60' : ''}`}
                    >
                      {isExpress && <Lock size={10} className="absolute top-1 right-1 text-ink-3" />}
                      Match
                    </button>
                    <button
                      onClick={() => handleGameModeClick('sindicato')}
                      className={`relative py-3 px-4 rounded-lg font-bold transition-all text-sm ${
                        gameMode === 'sindicato'
                          ? 'bg-accent text-on-accent shadow-card'
                          : 'bg-neutral text-ink hover:bg-neutral-hover'
                      } ${isExpress ? 'opacity-60' : ''}`}
                    >
                      {isExpress && <Lock size={10} className="absolute top-1 right-1 text-ink-3" />}
                      Sindicato
                    </button>
                    <button
                      onClick={() => handleGameModeClick('parejas')}
                      className={`relative py-3 px-4 rounded-lg font-bold transition-all text-sm ${
                        gameMode === 'parejas'
                          ? 'bg-accent text-on-accent shadow-card'
                          : 'bg-neutral text-ink hover:bg-neutral-hover'
                      } ${isExpress ? 'opacity-60' : ''}`}
                    >
                      {isExpress && <Lock size={10} className="absolute top-1 right-1 text-ink-3" />}
                      Parejas
                    </button>
                  </div>
                  {gameMode === 'match' && (
                    <p className="text-xs text-ink-3 mt-2">{t('roundSetup.matchHelp')}</p>
                  )}
                  {gameMode === 'sindicato' && (
                    <p className="text-xs text-ink-3 mt-2">{t('roundSetup.sindicatoHelp')}</p>
                  )}
                  {gameMode === 'parejas' && (
                    <p className="text-xs text-ink-3 mt-2">{t('roundSetup.pairsHelp')}</p>
                  )}
                </div>

                <WriteButton
                  onClick={handleCreateRound}
                  disabled={!selectedCourse || loading}
                  className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-on-accent font-bold py-4 rounded-lg flex items-center justify-center gap-2 transition-colors mt-6"
                >
                  {t('roundSetup.create')}
                  <ChevronRight size={20} />
                </WriteButton>
              </div>
            </div>
          )}

          {/* Columna derecha: Mi Partida y Estadísticas */}
          <div className="flex flex-col gap-4 h-full">
            {/* Ver Partida Activa */}
            <div
              onClick={onViewActiveRounds}
              className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900 border-2 border-amber-300 dark:border-amber-700 rounded-lg shadow-card cursor-pointer hover:shadow-2xl transition-shadow flex-[2] flex flex-col"
            >
              <div className="p-5 pb-4 flex-1">
                <div className="flex items-start justify-between mb-3">
                  <h2 className="text-2xl font-bold text-amber-900 dark:text-amber-100">
                    {currentGroup ? t('roundSetup.active') : t('roundSetup.myRound')}
                  </h2>
                  <div className="bg-amber-600 text-white font-bold rounded-full w-8 h-8 flex items-center justify-center text-base">
                    {activeRoundsCount}
                  </div>
                </div>
                <p className="text-ink-2 text-base leading-relaxed">
                  {currentGroup
                    ? t('roundSetup.activeDescription')
                    : t('roundSetup.myRoundDescription')}
                </p>
              </div>
              <button className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-4 rounded-b-md flex items-center justify-center gap-2 transition-colors text-base">
                {t('roundSetup.viewRound')}
                <ChevronRight size={20} />
              </button>
            </div>

            {/* Sección de Estadísticas para Partida Rápida */}
            {!currentGroup && onViewStatistics && (
              <div
                onClick={completedRounds.length > 0 ? onViewStatistics : undefined}
                className={`bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-2 border-blue-300 dark:border-blue-700 rounded-lg shadow-card flex-1 flex flex-col transition-all ${
                  completedRounds.length > 0
                    ? 'cursor-pointer hover:shadow-2xl'
                    : 'opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="p-5 pb-4 flex-1">
                  <div className="flex items-start justify-between mb-3">
                    <h2 className="text-2xl font-bold text-blue-900 dark:text-blue-100">{t('roundSetup.statistics')}</h2>
                    <div className="bg-blue-600 text-white font-bold rounded-full w-8 h-8 flex items-center justify-center text-base shadow-soft">
                      {completedRounds.length}
                    </div>
                  </div>

                  <p className="text-ink-2 text-base leading-relaxed">
                    {completedRounds.length > 0
                      ? t('roundSetup.statsAvailable')
                      : t('roundSetup.statsEmpty')}
                  </p>
                </div>

                {completedRounds.length > 0 && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewStatistics();
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-b-md flex items-center justify-center gap-2 transition-colors text-base"
                  >
                    <span>{t('roundSetup.viewStatistics')}</span>
                    <ChevronRight size={20} />
                  </button>
                )}
              </div>
            )}

            {!currentGroup && isExpress && quickPlayRoundsCount !== null && (
              <div className="bg-amber-100 dark:bg-amber-950 border-2 border-amber-300 dark:border-amber-700 rounded-xl p-4 text-amber-950 dark:text-amber-100 flex items-center gap-3 shadow-card">
                <Info className="text-amber-600 dark:text-amber-300 flex-shrink-0" size={24} />
                <div className="text-sm">
                  <p className="font-semibold">{t('roundSetup.express')}</p>
                  <p className="text-amber-800 dark:text-amber-200">
                    {t('roundSetup.remaining', { remaining: Math.max(0, MAX_EXPRESS_GAMES - quickPlayRoundsCount), total: MAX_EXPRESS_GAMES })}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Puntos de juego */}
        {currentGroup && (
          <div
            onClick={onViewGamePoints}
            className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 rounded-lg shadow-card p-6 md:p-8 cursor-pointer hover:shadow-xl transition-shadow"
          >
            <h2 className="text-2xl font-bold text-blue-900 mb-4">{t('roundSetup.points')}</h2>
            <p className="text-ink-2 mb-6">
              Consulta las clasificaciones de partidas completadas en el dia, los jugadores registrados y sus handicaps.
            </p>
            <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-lg flex items-center justify-center gap-2 transition-colors">
              {t('roundSetup.viewPoints')}
              <ChevronRight size={20} />
            </button>
          </div>
        )}

        {/* Estadísticas */}
        {currentGroup && onViewStatistics && (
          <div
            onClick={onViewStatistics}
            className="bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-300 rounded-lg shadow-card p-6 md:p-8 cursor-pointer hover:shadow-xl transition-shadow"
          >
            <h2 className="text-2xl font-bold text-purple-900 mb-4">{t('roundSetup.statistics')}</h2>
            <p className="text-ink-2 mb-6">
              Consulta estadísticas de jugadores, del grupo y de campos. Solo para multipartidetas archivadas.
            </p>
            <button className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-lg flex items-center justify-center gap-2 transition-colors">
              Ver Estadísticas
              <ChevronRight size={20} />
            </button>
          </div>
        )}
      </div>

      {showHolesRangeModal && (
        <HolesRangeModal
          onConfirm={handleHolesRangeConfirm}
          onCancel={handleHolesRangeCancel}
        />
      )}

      {showAdminPinModal && (
        <AdminPinModal
          onSubmit={handleAdminPinSubmit}
          onCancel={handleAdminPinCancel}
          error={pinError}
        />
      )}

      <ParTeeUpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onSelectTier={() => setShowUpgradeModal(false)}
      />
    </div>
  );
};
