import { WriteButton } from '../context/ReadOnlyContext';
import { NavigationButton } from './NavigationButton';
import { OmikiLoadingScreen, OmikiSpinner } from './OmikiSpinner';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SelectMenu } from './SelectMenu';
import { scoreResultChip, scoreResultFromPoints, scoreResultLabel } from '../utils/scoreColors';
import { Trophy, TrendingDown, Flag, Target, Zap, Trash2, EyeOff,
  Activity, Flame, Calendar, MessageCircle, Swords, Users, Briefcase, Download, Share2
} from 'lucide-react';
import { golfService } from '../services/golfService';
import { ConfirmModal } from './ConfirmModal';
import { calculateScoreToPar } from '../utils/calculations';
import { safeStorage } from '../utils/safeStorage';
import { GameMode, GolfHole, RoundPlayer, RoundScore, QuickPlayCompletedRound, QuickPlayAwardsSummary } from '../types';
import { ThemeToggle } from './ThemeToggle';
import { tiedAwardLeaders } from '../utils/awardTies';
import { competitionPosition } from '../utils/ranking';

interface QuickPlayStatisticsProps {
  onBack: () => void;
  roundId?: string;
  sharedRoundData?: QuickPlayCompletedRound | null;
  messagesButton?: React.ReactNode;
}

interface PlayerHighlights {
  playerId: string;
  playerName: string;
  handicap: number;
  totalPoints: number;
  totalGrossStrokes: number;
  scoreToPar: { value: number; display: string };
  eagles: number;
  birdies: number;
  pares: number;
  bogeys: number;
  doubleBogeyPlus: number;
  bestHole: { holeNumber: number; points: number };
  worstHole: { holeNumber: number; points: number };
  variability: number;
}

interface AvailableRound {
  id: string;
  created_at: string;
  status: string;
  game_mode?: string;
}

const waitForNextPaint = () => new Promise<void>((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
});

const canvasToPngBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  const timeout = window.setTimeout(() => reject(new Error('La conversión de la imagen ha tardado demasiado.')), 15000);
  canvas.toBlob((result) => {
    window.clearTimeout(timeout);
    if (result && result.size >= 10_000) resolve(result);
    else reject(new Error('El navegador ha generado una imagen vacía o incompleta.'));
  }, 'image/png');
});

const validatePngBlob = (blob: Blob, minimumWidth: number, minimumHeight: number) => new Promise<void>((resolve, reject) => {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  const finish = (error?: Error) => {
    URL.revokeObjectURL(url);
    window.clearTimeout(timeout);
    if (error) reject(error);
    else resolve();
  };
  const timeout = window.setTimeout(
    () => finish(new Error('El navegador no ha podido verificar la imagen generada.')),
    15000
  );
  image.onload = () => {
    if (image.naturalWidth < minimumWidth || image.naturalHeight < minimumHeight) {
      finish(new Error('La imagen generada tiene dimensiones incompletas.'));
      return;
    }
    finish();
  };
  image.onerror = () => finish(new Error('El archivo de imagen generado no se puede abrir.'));
  image.src = url;
});

const getEffectiveGrossStrokes = (score: RoundScore | undefined, hole?: GolfHole) => {
  if (!score) return 0;
  if (score.gross_strokes > 0) return score.gross_strokes;
  if (score.abandoned && hole) return hole.par + (score.strokes_received || 0) + 2;
  return 0;
};

const calculatePlayerHighlights = (
  players: RoundPlayer[],
  scores: RoundScore[],
  holes: GolfHole[],
): PlayerHighlights[] => {
  const coursePar = holes.reduce((sum, hole) => sum + hole.par, 0);
  return players.map(player => {
    const playerScores = scores.filter(score => score.player_id === player.id);

    let eagles = 0, birdies = 0, pares = 0, bogeys = 0, doubleBogeyPlus = 0;
    let bestHole = { holeNumber: 0, points: -999 };
    let worstHole = { holeNumber: 0, points: 999 };
    let totalPoints = 0;
    let totalGrossStrokes = 0;

    playerScores.forEach(score => {
      const hole = holes.find(item => item.hole_number === score.hole_number);
      totalGrossStrokes += getEffectiveGrossStrokes(score, hole);

      if (score.abandoned) {
        doubleBogeyPlus++;
        return;
      }
      const diff = score.net_strokes - (hole?.par || 0);
      const points = score.stableford_points || 0;

      totalPoints += points;

      if (points > bestHole.points) bestHole = { holeNumber: score.hole_number, points };
      if (points < worstHole.points) worstHole = { holeNumber: score.hole_number, points };

      if (diff <= -2) eagles++;
      else if (diff === -1) birdies++;
      else if (diff === 0) pares++;
      else if (diff === 1) bogeys++;
      else if (diff >= 2) doubleBogeyPlus++;
    });

    const scoreToPar = totalGrossStrokes === 0
      ? { value: 0, display: '-' }
      : calculateScoreToPar(totalGrossStrokes, coursePar, player.playing_handicap);

    return {
      playerId: player.id,
      playerName: player.name,
      handicap: player.playing_handicap,
      totalPoints,
      totalGrossStrokes,
      scoreToPar,
      eagles,
      birdies,
      pares,
      bogeys,
      doubleBogeyPlus,
      bestHole,
      worstHole,
      variability: bestHole.points - worstHole.points,
    };
  });
};

export const QuickPlayStatistics: React.FC<QuickPlayStatisticsProps> = ({ onBack, roundId, sharedRoundData = null, messagesButton }) => {
  const isSharedView = !!sharedRoundData;
  const [loading, setLoading] = useState(true);
  const [availableRounds, setAvailableRounds] = useState<AvailableRound[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [roundData, setRoundData] = useState<QuickPlayCompletedRound | null>(null);
  const [stats, setStats] = useState<QuickPlayAwardsSummary | null>(null);
  const [highlights, setHighlights] = useState<PlayerHighlights[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState('');
  const [shareAsset, setShareAsset] = useState<{ file: File; url: string; date: string } | null>(null);

  const statsContainerRef = useRef<HTMLDivElement>(null);
  const desktopExportRef = useRef<HTMLDivElement>(null);


  useEffect(() => () => {
    if (shareAsset) URL.revokeObjectURL(shareAsset.url);
  }, [shareAsset]);

  const handleSelectRound = async (roundId: string) => {
    setShareAsset(null);
    setShareError('');
    setSelectedRoundId(roundId);
    await loadRoundData(roundId);
  };

  const formatRoundLabel = (round: AvailableRound) => `${new Date(round.created_at).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })} - ${new Date(round.created_at).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit'
  })} · ${getModeLabel(round.game_mode)}`;

  const loadRoundData = useCallback(async (roundId: string) => {
    try {
      setLoading(true);
      setAnimateIn(false);

      const data = await golfService.getQuickPlayCompletedRound(roundId);

      if (data) {
        setRoundData(data);
        const calculatedStats = golfService.calculateQuickPlayAwards(
          data.players,
          data.scores,
          data.holes,
          data.round?.game_mode || 'stableford',
          data.round?.decided_result || null
        );
        setStats(calculatedStats);

        const playerHighlights = calculatePlayerHighlights(data.players, data.scores, data.holes);
        setHighlights(playerHighlights);

        // Activación de la animación sin generar bucles
        setTimeout(() => setAnimateIn(true), 150);
      } else {
        setRoundData(null);
      }
    } catch (err) {
      console.error('Error cargando estadísticas de la partida:', err);
      setRoundData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        if (sharedRoundData) {
          setAvailableRounds([]);
          setSelectedRoundId(sharedRoundData.round.id || null);
          setRoundData(sharedRoundData);
          setStats(golfService.calculateQuickPlayAwards(
            sharedRoundData.players,
            sharedRoundData.scores,
            sharedRoundData.holes,
            sharedRoundData.round.game_mode || 'stableford',
            sharedRoundData.round.decided_result || null
          ));
          setHighlights(calculatePlayerHighlights(sharedRoundData.players, sharedRoundData.scores, sharedRoundData.holes));
          setLoading(false);
          window.setTimeout(() => setAnimateIn(true), 150);
          return;
        }
        const rounds = await golfService.getAvailableRoundsForStats();
        setAvailableRounds(rounds);

        if (rounds.length > 0) {
          const initialRoundId = roundId && rounds.some(round => round.id === roundId) ? roundId : rounds[0].id;
          setSelectedRoundId(initialRoundId);
          await loadRoundData(initialRoundId);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error('Error inicializando lista de partidas:', err);
        setLoading(false);
      }
    };

    void init();
  }, [roundId, sharedRoundData, loadRoundData]);

  // El creador borra la partida; un jugador vinculado solo la descarta de sus listas y estadísticas.
  const isLinkedPlayer = roundData?.isCreator === false;

  const handleDelete = async () => {
    if (!selectedRoundId) return;
    try {
      if (isLinkedPlayer) {
        await golfService.dismissQuickRound(selectedRoundId);
      } else {
        await golfService.deleteQuickPlayCompletedRound(selectedRoundId);
        safeStorage.removeItem('quick_play_active_round');
      }
      setShowDeleteConfirm(false);

      const updatedRounds = availableRounds.filter(r => r.id !== selectedRoundId);
      setAvailableRounds(updatedRounds);

      if (updatedRounds.length > 0) {
        handleSelectRound(updatedRounds[0].id);
      } else {
        onBack();
      }
    } catch (err) {
      console.error('Error eliminando la partida:', err);
      setShowDeleteConfirm(false);
      setShareError(isLinkedPlayer ? 'No se pudo descartar la partida.' : 'No se pudo eliminar la partida.');
    }
  };

  const handleShareWhatsApp = async () => {
    if (!desktopExportRef.current) return;

    const exportElement = desktopExportRef.current;
    const exportWrapper = exportElement.closest<HTMLElement>('[data-statistics-export-wrapper]');
    const previousWrapperStyle = exportWrapper?.getAttribute('style') ?? null;
    const previousExportStyle = exportElement.getAttribute('style');

    try {
      setSharing(true);
      setShareError('');
      setShareAsset(null);

      // html2canvas es inestable en algunos navegadores móviles cuando el nodo
      // fuente está miles de píxeles fuera del viewport. Se hace renderizable
      // durante la captura y se restaura siempre en finally.
      if (exportWrapper) {
        Object.assign(exportWrapper.style, {
          position: 'fixed',
          inset: '0 auto auto 0',
          width: '1200px',
          height: 'auto',
          overflow: 'visible',
          pointerEvents: 'none',
          zIndex: '2147483000',
        });
      }
      Object.assign(exportElement.style, {
        display: 'block',
        width: '1200px',
        maxWidth: 'none',
        height: 'auto',
        overflow: 'visible',
      });

      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      await Promise.all(
        Array.from(exportElement.querySelectorAll('img')).map(async (image) => {
          if (!image.complete) {
            await new Promise<void>((resolve) => {
              image.addEventListener('load', () => resolve(), { once: true });
              image.addEventListener('error', () => resolve(), { once: true });
            });
          }
          if (typeof image.decode === 'function') {
            await image.decode().catch(() => undefined);
          }
        })
      );

      await waitForNextPaint();

      const exportWidth = Math.ceil(Math.max(1200, exportElement.scrollWidth));
      const exportHeight = Math.ceil(exportElement.scrollHeight);
      const { default: html2canvas } = await import('html2canvas-pro');
      const maxCanvasSide = 4096;
      const scaleLimits = [8_000_000, 5_000_000, 3_000_000];
      let blob: Blob | null = null;
      let lastCaptureError: unknown = null;

      const prepareClonedExport = (clonedDocument: Document) => {
        const clonedExport = clonedDocument.querySelector<HTMLElement>('[data-statistics-export]');
        const clonedWrapper = clonedDocument.querySelector<HTMLElement>('[data-statistics-export-wrapper]');

        if (clonedWrapper) {
          clonedWrapper.style.position = 'absolute';
          clonedWrapper.style.inset = '0 auto auto 0';
          clonedWrapper.style.width = `${exportWidth}px`;
          clonedWrapper.style.height = `${exportHeight}px`;
          clonedWrapper.style.overflow = 'visible';
        }

        if (clonedExport) {
          clonedExport.style.width = `${exportWidth}px`;
          clonedExport.style.height = 'auto';
          clonedExport.style.maxWidth = 'none';
          clonedExport.style.overflow = 'visible';

          let ancestor = clonedExport.parentElement;
          while (ancestor) {
            ancestor.style.overflow = 'visible';
            ancestor.style.maxHeight = 'none';
            ancestor = ancestor.parentElement;
          }

          clonedExport.querySelectorAll<HTMLElement>('*').forEach((element) => {
            element.style.animation = 'none';
            element.style.transition = 'none';
            if (
              element.classList.contains('overflow-x-auto') ||
              element.classList.contains('overflow-hidden')
            ) {
              element.style.overflow = 'visible';
            }
            if (element.classList.contains('sticky')) {
              element.style.position = 'static';
            }
          });
        }
      };

      const captureStatistics = (scale: number) => html2canvas(exportElement, {
        scale,
        useCORS: true,
        backgroundColor: '#0f172a',
        logging: false,
        scrollX: 0,
        scrollY: 0,
        width: exportWidth,
        height: exportHeight,
        windowWidth: exportWidth,
        windowHeight: exportHeight,
        onclone: prepareClonedExport,
      });

      // Algunos navegadores móviles devuelven incompleta la primera captura aunque
      // el canvas tenga dimensiones válidas. La generamos y descartamos para que la
      // captura que recibe el usuario se haga con fuentes y estilos ya renderizados.
      try {
        await waitForNextPaint();
        const warmupScale = Math.max(0.35, Math.min(
          0.5,
          maxCanvasSide / exportWidth,
          maxCanvasSide / exportHeight,
          Math.sqrt(2_000_000 / (exportWidth * exportHeight))
        ));
        const warmupCanvas = await captureStatistics(warmupScale);
        await canvasToPngBlob(warmupCanvas);
        warmupCanvas.width = 1;
        warmupCanvas.height = 1;
      } catch (warmupError) {
        console.warn('La captura de preparación de estadísticas no se completó:', warmupError);
      }

      await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
      await waitForNextPaint();

      for (const maxCanvasPixels of scaleLimits) {
        try {
          const scale = Math.max(0.5, Math.min(
            1.5,
            maxCanvasSide / exportWidth,
            maxCanvasSide / exportHeight,
            Math.sqrt(maxCanvasPixels / (exportWidth * exportHeight))
          ));

          await waitForNextPaint();
          const canvas = await captureStatistics(scale);

          if (canvas.width < 600 || canvas.height < 600) {
            throw new Error('La captura devuelta por el navegador está incompleta.');
          }
          const canvasWidth = canvas.width;
          const canvasHeight = canvas.height;
          const candidate = await canvasToPngBlob(canvas);
          canvas.width = 1;
          canvas.height = 1;
          await validatePngBlob(candidate, canvasWidth, canvasHeight);
          blob = candidate;
          break;
        } catch (captureError) {
          lastCaptureError = captureError;
          console.warn('Reintentando la captura de estadísticas con menor resolución:', captureError);
        }
      }

      if (!blob) {
        throw lastCaptureError instanceof Error
          ? lastCaptureError
          : new Error('No se pudo generar una imagen válida.');
      }

      const dateStr = new Date(roundData?.round?.created_at || Date.now()).toLocaleDateString('es-ES');
      const fileName = `Estadisticas_Golf_${dateStr.replace(/\//g, '-')}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      setShareAsset({ file, url: URL.createObjectURL(blob), date: dateStr });
    } catch (error) {
      console.error('Error al generar la imagen para WhatsApp:', error);
      setShareError('No se ha podido generar la imagen completa. Inténtalo de nuevo.');
    } finally {
      if (exportWrapper) {
        if (previousWrapperStyle === null) exportWrapper.removeAttribute('style');
        else exportWrapper.setAttribute('style', previousWrapperStyle);
      }
      if (previousExportStyle === null) exportElement.removeAttribute('style');
      else exportElement.setAttribute('style', previousExportStyle);
      setSharing(false);
    }
  };

  const handleNativeShare = async () => {
    if (!shareAsset) return;
    setShareError('');
    if (!navigator.share || !navigator.canShare?.({ files: [shareAsset.file] })) {
      setShareError('Este navegador no permite compartir archivos directamente. Descarga la imagen y adjúntala en WhatsApp.');
      return;
    }
    try {
      await navigator.share({
        files: [shareAsset.file],
        title: 'Estadísticas de la partida',
        text: `📊 ¡Mirad las estadísticas de nuestra partida de golf! (${shareAsset.date})`,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setShareError('El móvil no ha podido abrir el selector para compartir. Descarga la imagen y envíala desde WhatsApp.');
    }
  };

  const handleDownloadShare = () => {
    if (!shareAsset) return;
    const link = document.createElement('a');
    link.href = shareAsset.url;
    link.download = shareAsset.file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const getModeLabel = (mode?: string) => {
    switch (mode) {
      case 'match': return 'Match';
      case 'sindicato': return 'Sindicato';
      case 'parejas': return 'Parejas';
      default: return 'Stableford';
    }
  };

  if (loading) {
    return (
      <div className="relative">
        <div className="absolute right-4 top-4 z-10">{messagesButton}</div>
        <OmikiLoadingScreen label="Cargando estadísticas…" />
      </div>
    );
  }

  if (!roundData || !stats) {
    return (
      <div className="min-h-screen bg-app p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 flex items-center justify-between"><NavigationButton destination="back"
            onClick={onBack}
            className="bg-white hover:bg-gray-100 text-emerald-900 font-bold py-2 px-3 rounded-lg flex items-center justify-center transition-colors"
          />{messagesButton}</div>

          <div className="bg-white rounded-lg shadow-2xl p-8 text-center">
            <TrendingDown size={64} className="mx-auto text-gray-400 mb-4" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">No hay estadísticas disponibles</h2>
            <p className="text-gray-600">
              Completa una partida de Quick Play para ver las estadísticas.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { round, course, holes } = roundData;
  const { ranking, awards } = stats;
  const gameMode = (round?.game_mode || 'stableford') as GameMode;

  const namesOf = (entries: PlayerHighlights[]) => entries.map((entry) => entry.playerName).join(' / ');
  const rankingPosition = (index: number) => competitionPosition(ranking, index, (a, b) => a.totalPoints === b.totalPoints && a.player.playing_handicap === b.player.playing_handicap);
  const rankedHighlights = [...highlights].sort((a, b) => b.totalPoints - a.totalPoints || a.handicap - b.handicap);
  const highlightPosition = (index: number) => competitionPosition(rankedHighlights, index, (a, b) => a.totalPoints === b.totalPoints && a.handicap === b.handicap);
  const birdieKings = tiedAwardLeaders(highlights, h => h.birdies, 'max', h => h.handicap, 'lower');
  const rollerCoasters = tiedAwardLeaders(highlights, h => h.variability, 'max', h => h.handicap, 'higher');
  const bogeyKings = tiedAwardLeaders(highlights, h => h.bogeys, 'max', h => h.handicap, 'higher');
  const doubleBogeyKings = tiedAwardLeaders(highlights, h => h.doubleBogeyPlus, 'max', h => h.handicap, 'higher');
  const getPlayerGrossStrokes = (playerId: string) => highlights.find((h) => h.playerId === playerId)?.totalGrossStrokes ?? 0;
  const getPlayerScoreToPar = (playerId: string) => highlights.find((h) => h.playerId === playerId)?.scoreToPar ?? { value: 0, display: '-' };

  const bestIndividualHoles = tiedAwardLeaders(highlights, h => h.bestHole.points, 'max', h => h.handicap, 'lower');
  const worstIndividualHoles = tiedAwardLeaders(highlights, h => h.worstHole.points, 'min', h => h.handicap, 'higher');

  const isStablefordMode = gameMode === 'stableford';
  const isMatchMode = gameMode === 'match';
  const isSindicatoMode = gameMode === 'sindicato';
  const isParejasMode = gameMode === 'parejas';

  const matchResult = stats.matchResult || null;
  const teamResult = stats.teamResult || null;

  let holeTableRows: {
    key: string;
    name: string;
    totalPoints: number;
    handicap?: number;
    scores: RoundScore[];
    rank: number;
  }[] = [];

  if (isParejasMode && roundData.players) {
    const team0Players = roundData.players.slice(0, 2);
    const team1Players = roundData.players.slice(2, 4);

    const buildTeamRow = (players: RoundPlayer[], label: string) => {
      const rep = players[0];
      const playerScores = rep
        ? roundData.scores.filter((s) => s.player_id === rep.id)
        : [];
      const totalPoints = rep
        ? playerScores
            .reduce((sum, s) => sum + (s.mode_points || 0), 0)
        : 0;
      return {
        key: label,
        name: players.map((p) => p.name).join(' / '),
        totalPoints,
        handicap: players.reduce((sum, player) => sum + player.playing_handicap, 0),
        scores: playerScores,
        rank: 0,
      };
    };

    holeTableRows = [
      buildTeamRow(team0Players, 'team0'),
      buildTeamRow(team1Players, 'team1'),
    ].sort((a, b) => b.totalPoints - a.totalPoints || (a.handicap ?? 0) - (b.handicap ?? 0));

    holeTableRows.forEach((row, idx) => { row.rank = idx; });
  } else {
    holeTableRows = ranking.map((entry, index) => ({
      key: entry.player.id,
      name: entry.player.name,
      totalPoints: entry.totalPoints,
      scores: roundData.scores.filter((s) => s.player_id === entry.player.id),
      rank: index,
    }));
  }

  // En Parejas, los dos jugadores de cada pareja comparten color (azul y naranja, como en la tarjeta).
  const teamOfPlayer = (playerId: string): 0 | 1 | null => {
    if (!isParejasMode || !roundData.players) return null;
    const position = roundData.players.findIndex((player) => player.id === playerId);
    return position < 0 ? null : position < 2 ? 0 : 1;
  };
  const positionBadgeClass = (index: number, team: 0 | 1 | null) =>
    team === 0 ? 'bg-blue-600 text-white' :
    team === 1 ? 'bg-orange-700 text-white' :
    index === 0 ? 'bg-yellow-400 text-yellow-950' :
    index === 1 ? 'bg-slate-400 text-slate-900' :
    index === 2 ? 'bg-orange-400 text-orange-950' :
    'bg-gray-600 text-white';

  // Fichas del podio compactas: posición, nombre y HCP en una fila; puntos y vs par en dos columnas.
  const podiumStyles = [
    { card: 'gold-card bg-gradient-to-br from-yellow-400 to-yellow-500 border-yellow-300', badge: 'bg-yellow-300 text-yellow-900', name: 'text-yellow-900', hcp: 'text-yellow-800', box: 'bg-white/35', points: 'text-yellow-900', detail: 'text-yellow-900', toParBox: 'bg-white/25', toParLabel: 'text-yellow-900', even: 'text-yellow-900', under: 'text-green-700', over: 'text-red-700' },
    { card: 'bg-gradient-to-br from-slate-600 to-slate-700 border-slate-400', badge: 'bg-slate-400 text-slate-900', name: 'text-slate-100', hcp: 'text-slate-300', box: 'bg-white/10', points: 'text-white', detail: 'text-slate-300', toParBox: 'bg-slate-500/30', toParLabel: 'text-slate-200', even: 'text-white', under: 'text-green-300', over: 'text-red-300' },
    { card: 'bg-gradient-to-br from-orange-600 to-orange-700 border-orange-400', badge: 'bg-orange-400 text-orange-900', name: 'text-orange-100', hcp: 'text-orange-200', box: 'bg-white/10', points: 'text-white', detail: 'text-orange-200', toParBox: 'bg-orange-500/30', toParLabel: 'text-orange-200', even: 'text-white', under: 'text-green-300', over: 'text-red-300' },
  ];

  const renderPodiumGrid = () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
      {ranking.map((entry, index) => ({ entry, index, position: rankingPosition(index) })).filter(item => item.position <= 3).map(({ entry, index, position }) => {
        const style = podiumStyles[Math.min(position - 1, podiumStyles.length - 1)];
        const toPar = getPlayerScoreToPar(entry.player.id);
        return (
          <div key={entry.player.id} className="h-full transform transition-all duration-700 hover:scale-105" style={{ animationDelay: `${index * 200}ms` }}>
            <div className={`${style.card} rounded-2xl border-2 p-3 shadow-xl h-full flex flex-col justify-between`}>
              <div className="mb-2 flex items-center gap-2">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg font-black shadow ${style.badge}`}>
                  {position}
                </span>
                <p className={`min-w-0 truncate text-lg font-black ${style.name}`}>{entry.player.name}</p>
                <span className={`shrink-0 text-xs font-semibold ${style.hcp}`}>HCP {entry.player.playing_handicap}</span>
              </div>
              <div className={`grid gap-2 text-center mt-auto ${gameMode === 'stableford' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <div className={`rounded-lg p-2 ${style.box}`}>
                  <p className={`text-3xl font-black leading-none ${style.points}`}>{entry.totalPoints}</p>
                  <p className={`mt-1 text-xs font-semibold ${style.detail}`}>puntos · {getPlayerGrossStrokes(entry.player.id)} golpes</p>
                </div>
                {gameMode === 'stableford' && (
                  <div className={`rounded-lg p-2 ${style.toParBox}`}>
                    <p className={`text-3xl font-black leading-none ${toPar.value === 0 ? style.even : toPar.value < 0 ? style.under : style.over}`}>
                      {toPar.display}
                    </p>
                    <p className={`mt-1 text-xs font-medium ${style.toParLabel}`}>vs Par Personal</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  // Match y Parejas: VS y diferencia centrados encima; las dos fichas compactas en la misma fila.
  type VersusSide = { label: string; name: string; points: number; handicap: number };
  const renderVersusCards = (vsClass: string, winner: VersusSide, loser: VersusSide, difference: { text: string; label: string }) => (
    <>
      <div className="mb-3 flex justify-center">
        <div className="flex items-center gap-2 rounded-xl bg-white/10 py-1 pl-1 pr-3">
          <span className={`rounded-lg px-3 py-1 text-lg font-black text-white shadow-lg ${vsClass}`}>VS</span>
          <span className="text-lg font-bold text-white">{difference.text}</span>
          <span className="text-xs text-white/60">{difference.label}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:gap-4 text-center items-stretch">
        <div className="gold-card bg-gradient-to-br from-yellow-400 to-amber-500 rounded-2xl border-2 border-yellow-300 p-3 shadow-xl flex flex-col justify-between h-full">
          <div>
            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-300 px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-yellow-900">
              <Trophy size={12} /> {winner.label}
            </span>
            <div className="mt-1 min-h-[2.75rem] flex items-center justify-center">
              <p className="break-words text-sm sm:text-base font-black leading-tight text-yellow-900 line-clamp-2">{winner.name}</p>
            </div>
            <p className="text-xs font-bold text-yellow-800">HCP {winner.handicap}</p>
          </div>
          <div className="mt-2 pt-1 border-t border-yellow-300/40">
            <p className="text-3xl font-black leading-none text-yellow-900">{winner.points}</p>
            <p className="mt-1 text-xs font-semibold text-yellow-800">puntos</p>
          </div>
        </div>
        <div className="bg-gradient-to-br from-slate-600 to-slate-700 rounded-2xl border-2 border-slate-500 p-3 shadow-xl flex flex-col justify-between h-full">
          <div>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-500 px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-white">
              <TrendingDown size={12} /> {loser.label}
            </span>
            <div className="mt-1 min-h-[2.75rem] flex items-center justify-center">
              <p className="break-words text-sm sm:text-base font-black leading-tight text-white line-clamp-2">{loser.name}</p>
            </div>
            <p className="text-xs font-bold text-slate-300">HCP {loser.handicap}</p>
          </div>
          <div className="mt-2 pt-1 border-t border-slate-500/40">
            <p className="text-3xl font-black leading-none text-white">{loser.points}</p>
            <p className="mt-1 text-xs font-semibold text-slate-300">puntos</p>
          </div>
        </div>
      </div>
    </>
  );

  // La pantalla y la imagen comparten las mismas tablas y premios.
  const renderStatisticsDetails = (exporting = false) => (
    <>
          {/* TABLA COMPLETA */}
          <div
            className={`statistics-panel backdrop-blur-md rounded-2xl p-6 mb-8 transition-all duration-1000 delay-500 ${
              exporting || animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
            }`}
          >
            <h3 className="statistics-table-title text-2xl font-black mb-6">Detalle contra Par</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="statistics-table-line border-b-2">
                    <th className="statistics-table-text text-left font-bold p-3">Jugador</th>
                    <th className="statistics-table-text text-center font-bold p-3">Puntos</th>
                    <th className="statistics-table-text text-center font-bold p-3">vs Par</th>
                    <th className="statistics-table-text text-center font-bold p-3">Eagles+</th>
                    <th className="statistics-table-text text-center font-bold p-3">Birdies</th>
                    <th className="statistics-table-text text-center font-bold p-3">Pares</th>
                    <th className="statistics-table-text text-center font-bold p-3">Bogeys</th>
                    <th className="statistics-table-text text-center font-bold p-3">Doble+</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedHighlights.map((h, index) => (
                    <tr key={h.playerId} className="statistics-table-line statistics-table-row border-b transition-colors">
                      <td className="statistics-table-text font-semibold p-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full text-xs font-bold ${positionBadgeClass(index, teamOfPlayer(h.playerId))}`}>
                            {highlightPosition(index)}
                          </span>
                          {h.playerName}
                        </div>
                      </td>
                      <td className="statistics-table-accent text-center font-bold p-3 text-lg">{h.totalPoints}</td>
                      <td className={`text-center font-bold p-3 text-lg ${
                        h.scoreToPar.value === 0 ? 'statistics-table-text' :
                        h.scoreToPar.value < 0 ? 'statistics-table-positive' :
                        'statistics-table-negative'
                      }`}>
                        {h.scoreToPar.display}
                      </td>
                      <td className="statistics-table-text text-center p-3">{h.eagles}</td>
                      <td className="statistics-table-text text-center p-3">{h.birdies}</td>
                      <td className="statistics-table-text text-center p-3">{h.pares}</td>
                      <td className="statistics-table-text text-center p-3">{h.bogeys}</td>
                      <td className="statistics-table-text text-center p-3">{h.doubleBogeyPlus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* PUNTOS POR HOYO */}
          <div
            className={`statistics-panel backdrop-blur-md rounded-2xl p-6 mb-8 transition-all duration-1000 delay-700 ${
              exporting || animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
            }`}
          >
            <h3 className="statistics-table-title text-2xl font-black mb-6">
              {isMatchMode ? 'Puntos por Hoyo (Match)' :
               isSindicatoMode ? 'Puntos por Hoyo (Sindicato)' :
               isParejasMode ? 'Puntos por Hoyo (Parejas)' :
               'Puntos por Hoyo'}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="statistics-table-line border-b-2">
                    <th className="statistics-table-text text-left font-bold p-2">
                      {isParejasMode ? 'Pareja' : 'Jugador'}
                    </th>
                    {holes.map((hole) => (
                      <th key={hole.hole_number} className="statistics-table-text text-center font-bold p-2 min-w-[40px]">
                        {hole.hole_number}
                      </th>
                    ))}
                    <th className="statistics-table-text statistics-table-total text-center font-bold p-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {holeTableRows.map((row) => {
                    return (
                      <tr key={row.key} className="statistics-table-line statistics-table-row border-b transition-colors">
                        <td className="statistics-table-text font-semibold p-2">
                          <span className="flex items-center gap-2">
                            <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${positionBadgeClass(row.rank, isParejasMode ? (row.key === 'team0' ? 0 : 1) : null)}`}>
                              {row.rank + 1}
                            </span>
                            {row.name}
                          </span>
                        </td>
                        {holes.map((hole) => {
                          const score = row.scores.find((s) => s.hole_number === hole.hole_number);
                          const isAbandoned = score?.abandoned;
                          const points = isMatchMode || isSindicatoMode || isParejasMode
                            ? (score?.mode_points || 0)
                            : (score?.stableford_points || 0);

                          if (isAbandoned) {
                            return (
                              <td key={hole.hole_number} className="statistics-table-text text-center p-2 font-bold">
                                0
                              </td>
                            );
                          }

                          return (
                            <td key={hole.hole_number} className={`text-center p-2 font-bold ${
                              isMatchMode || isSindicatoMode || isParejasMode ? (
                                points > 0 ? 'statistics-table-accent' :
                                points === 0 ? 'statistics-table-negative' :
                                'statistics-table-text'
                              ) : (
                                points >= 4 ? 'statistics-table-positive' :
                                points === 3 ? 'statistics-table-accent' :
                                points === 2 ? 'statistics-table-text' :
                                points === 1 ? 'statistics-table-warning' :
                                'statistics-table-negative'
                              )
                            }`}>
                              {points}
                            </td>
                          );
                        })}
                        <td className="statistics-table-accent statistics-table-total text-center font-black p-2 text-lg">
                          {row.totalPoints}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* TABLA DE GOLPES */}
          <div
            className={`statistics-panel backdrop-blur-md rounded-2xl p-6 mb-8 transition-all duration-1000 delay-600 ${
              exporting || animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
            }`}
          >
            <h3 className="statistics-table-title text-2xl font-black mb-6">Tabla de Golpes</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="statistics-table-line border-b-2">
                    <th className="statistics-table-text text-left font-bold p-2">Jugador</th>
                    {holes.map((hole) => (
                      <th key={hole.hole_number} className="statistics-table-text text-center font-bold p-2 min-w-[40px]">
                        {hole.hole_number}
                      </th>
                    ))}
                    <th className="statistics-table-text statistics-table-total text-center font-bold p-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((entry, index) => {
                    const playerScores = roundData.scores.filter((s) => s.player_id === entry.player.id);
                    const totalGross = playerScores.reduce((sum, score) => {
                      const hole = holes.find((h) => h.hole_number === score.hole_number);
                      return sum + getEffectiveGrossStrokes(score, hole);
                    }, 0);

                    return (
                      <tr key={entry.player.id} className="statistics-table-line statistics-table-row border-b transition-colors">
                        <td className="statistics-table-text font-semibold p-2">
                          <div className="flex items-center gap-2">
                            <span className={`w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full text-xs font-bold ${positionBadgeClass(index, teamOfPlayer(entry.player.id))}`}>
                              {rankingPosition(index)}
                            </span>
                            {entry.player.name}
                          </div>
                        </td>
                        {holes.map((hole) => {
                          const score = playerScores.find((s) => s.hole_number === hole.hole_number);
                          const value = getEffectiveGrossStrokes(score, hole);
                          const result = scoreResultFromPoints(score?.stableford_points, score?.abandoned);
                          return (
                            <td key={hole.hole_number} className="text-center p-1.5">
                              {score ? (
                                <span title={scoreResultLabel[result]} className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ring-1 ${scoreResultChip[result]}`}>
                                  {value}
                                </span>
                              ) : (
                                <span className="statistics-table-text font-bold">{value}</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="statistics-table-accent statistics-table-total text-center font-black p-2 text-lg">{totalGross}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs" aria-label="Colores de la tabla de golpes">
              {(Object.keys(scoreResultChip) as Array<keyof typeof scoreResultChip>).map((result) => (
                <span key={result} className="statistics-table-text inline-flex items-center gap-1.5">
                  <span className={`h-3.5 w-3.5 rounded-full ring-1 ${scoreResultChip[result]}`} aria-hidden="true" />
                  {scoreResultLabel[result]}
                </span>
              ))}
            </div>
          </div>

          {/* PREMIOS ESPECIALES */}
          {(awards.reyDelBosque || awards.noPasoRojas || awards.holeInOne || awards.hoyoMuerte || awards.hoyoGloria) && (
            <div
              className={`statistics-panel backdrop-blur-md rounded-2xl p-6 transition-all duration-1000 ${
                exporting || animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
              }`}
            >
              <h3 className="statistics-table-title text-2xl font-black mb-6">Premios Especiales</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" style={exporting ? { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' } : undefined}>
                {awards.reyDelBosque && (
                  <div className="bg-gradient-to-br from-rose-500/20 to-rose-600/20 border-2 border-rose-400 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingDown size={20} className="text-rose-400" />
                      <p className="text-rose-300 font-bold text-sm">Rey del Bosque</p>
                    </div>
                    <p className="statistics-table-text font-bold text-lg">{awards.reyDelBosque.players.map(player => player.name).join(' / ')}</p>
                    <p className="text-rose-300 text-sm">Mayor número de dobles bogeys o peor</p>
                  </div>
                )}

                {awards.noPasoRojas && (
                  <div className="bg-gradient-to-br from-amber-500/20 to-amber-600/20 border-2 border-amber-400 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Flag size={20} className="text-amber-400" />
                      <p className="text-amber-300 font-bold text-sm">No Pasó Rojas</p>
                    </div>
                    <p className="statistics-table-text font-bold text-lg">{awards.noPasoRojas.players.map(player => player.name).join(' / ')}</p>
                    <p className="text-amber-300 text-sm">Premio a la salida más corta</p>
                  </div>
                )}

                {awards.holeInOne && (
                  <div className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/20 border-2 border-yellow-400 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap size={20} className="text-yellow-400" />
                      <p className="text-yellow-300 font-bold text-sm">Hole in One</p>
                    </div>
                    <p className="statistics-table-text font-bold text-lg">
                      {awards.holeInOne.players.map(({ player }) => player.name).join(' / ')}
                    </p>
                    <p className="text-yellow-300 text-sm">¡Hoyo en uno increíble!</p>
                  </div>
                )}
              </div>
            </div>
          )}
    </>
  );

  return (
    <div className="statistics-theme min-h-screen bg-app text-ink p-4 md:p-8 relative overflow-hidden">
      {sharing && (
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/90 p-6" role="status" aria-live="polite">
          <div className="rounded-2xl border border-emerald-400/40 bg-slate-900 p-6 text-center text-white shadow-2xl">
            <OmikiSpinner size={90} className="mx-auto mb-4" />
            <p className="font-bold">Generando la imagen completa…</p>
            <p className="mt-1 text-sm text-slate-300">Puede tardar unos segundos en el móvil.</p>
          </div>
        </div>
      )}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0iIzFmMmQzZCIgc3Ryb2tlLXdpZHRoPSIuNSIgb3BhY2l0eT0iLjMiLz48L2c+PC9zdmc+')] opacity-20"></div>

      <div className="max-w-7xl mx-auto relative z-10">

        {/* BARRA SUPERIOR / CONTROLES */}
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="relative flex min-h-11 w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <NavigationButton destination="back"
                onClick={onBack}
                className="bg-card hover:bg-card-2 border border-line text-ink font-bold py-2 px-3 rounded-lg flex items-center gap-2 transition-all hover:scale-105"
              />
              <ThemeToggle />
            </div>
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              {messagesButton}
            </div>
            <div className="w-[5.5rem]" aria-hidden="true" />
          </div>

          <div className="text-center flex flex-col items-center gap-2">
            <h1 className="text-3xl md:text-5xl font-black text-title">Estadísticas</h1>

            {availableRounds.length > 0 && (
              <p className="mt-2 whitespace-nowrap text-sm font-semibold text-ink">Selecciona la partida a consultar</p>
            )}

            {availableRounds.length > 0 && (
              <SelectMenu
                className="max-w-md"
                value={selectedRoundId || availableRounds[0].id}
                onChange={(roundId) => void handleSelectRound(roundId)}
                ariaLabel="Partida a mostrar"
                icon={<Calendar size={19} />}
                options={availableRounds.map((round) => ({ value: round.id, label: formatRoundLabel(round) }))}
              />
            )}

            <p className="text-accent-ink font-semibold text-xs md:text-sm mt-1">
              {course?.name} · <span className="uppercase tracking-wider">{gameMode}</span>
            </p>
          </div>

          <div className="flex w-full flex-wrap items-center justify-center gap-3">
            <button
              onClick={handleShareWhatsApp}
              disabled={sharing}
              className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-all hover:scale-105 shadow-lg disabled:opacity-50"
            >
              <MessageCircle size={20} />
              <span>{sharing ? 'Generando...' : 'Compartir'}</span>
            </button>

            {/* Solo quien creó la partida puede eliminarla; los jugadores vinculados pueden descartarla. */}
            {!isSharedView && (
              <WriteButton
                onClick={() => setShowDeleteConfirm(true)}
                className={`${isLinkedPlayer ? 'bg-slate-600/90 hover:bg-slate-700' : 'bg-red-600/90 hover:bg-red-700'} backdrop-blur-sm text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-all hover:scale-105`}
              >
                {isLinkedPlayer ? <EyeOff size={20} /> : <Trash2 size={20} />}
                <span>{isLinkedPlayer ? 'Descartar' : 'Eliminar'}</span>
              </WriteButton>
            )}
          </div>
        </div>

        {isSharedView && (
          <div className="mb-6 rounded-xl border border-emerald-400/40 bg-slate-900/80 px-4 py-3 text-center text-sm font-semibold text-emerald-100">
            Consulta mediante código · Estadísticas en modo solo lectura
          </div>
        )}

        {shareError && (
          <div role="alert" className="mb-4 rounded-xl border border-red-400/50 bg-red-950/70 px-4 py-3 text-sm text-red-100">
            {shareError}
          </div>
        )}

        {shareAsset && (
          <div className="mb-4 rounded-xl border border-emerald-400/40 bg-slate-900/90 p-4 text-white shadow-xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <img src={shareAsset.url} alt="Vista previa de las estadísticas" className="h-24 w-24 rounded-lg border border-white/20 object-cover object-top" />
              <div className="flex-1">
                <p className="font-bold text-emerald-300">Imagen preparada</p>
                <p className="mt-1 text-sm text-slate-300">En móvil, «Compartir imagen» abre el selector del sistema para elegir WhatsApp. Si no aparece, descárgala y adjúntala desde el chat.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void handleNativeShare()} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-bold hover:bg-green-500">
                    <Share2 size={18} /> Compartir imagen
                  </button>
                  <button type="button" onClick={handleDownloadShare} className="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm font-bold hover:bg-slate-600">
                    <Download size={18} /> Descargar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CONTENEDOR VISIBLE DE LA PWA */}
        <div ref={statsContainerRef} className="p-4 md:p-6 rounded-2xl bg-card border border-line shadow-card">

          {isSindicatoMode && (
            <div
              className={`mb-8 transition-all duration-1000 ${
                animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
              }`}
            >
              <div className="bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 rounded-3xl p-8 shadow-2xl border-2 border-emerald-500/30 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500"></div>

                <div className="flex items-center justify-center gap-3 mb-8">
                  <Briefcase size={28} className="text-emerald-400" />
                  <h2 className="text-2xl md:text-3xl font-black text-white tracking-wider">SINDICATO</h2>
                  <Briefcase size={28} className="text-emerald-400" />
                </div>

                {renderPodiumGrid()}
              </div>
            </div>
          )}

          {isMatchMode && matchResult && (
            <div
              className={`mb-8 transition-all duration-1000 ${
                animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
              }`}
            >
              <div className="bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 rounded-3xl p-3 md:p-6 shadow-2xl border-2 border-red-500/30 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-amber-500 to-red-500"></div>

                <div className="flex items-center justify-center gap-3 mb-3">
                  <Swords size={28} className="text-red-400" />
                  <h2 className="text-2xl md:text-3xl font-black text-white tracking-wider">MATCH PLAY</h2>
                  <Swords size={28} className="text-red-400" />
                </div>

                {renderVersusCards(
                  'bg-red-600',
                  { label: matchResult.isTie ? 'Empate' : 'Ganador', name: matchResult.winner?.name || '—', points: matchResult.winnerPoints, handicap: matchResult.winner?.playing_handicap ?? 0 },
                  { label: matchResult.isTie ? 'Empate' : 'Perdedor', name: matchResult.loser?.name || '—', points: matchResult.loserPoints, handicap: matchResult.loser?.playing_handicap ?? 0 },
                  { text: matchResult.displayText || (matchResult.isTie ? '0' : `+${matchResult.margin}`), label: matchResult.isTie ? 'empate' : 'diferencia' },
                )}
              </div>
            </div>
          )}

          {isParejasMode && teamResult && (
            <div
              className={`mb-8 transition-all duration-1000 ${
                animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
              }`}
            >
              <div className="bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 rounded-3xl p-3 md:p-6 shadow-2xl border-2 border-blue-500/30 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-500"></div>

                <div className="flex items-center justify-center gap-3 mb-3">
                  <Users size={28} className="text-blue-400" />
                  <h2 className="text-2xl md:text-3xl font-black text-white tracking-wider">PAREJAS</h2>
                  <Users size={28} className="text-blue-400" />
                </div>

                {renderVersusCards(
                  'bg-blue-600',
                  { label: teamResult.isTie ? 'Empate' : 'Ganadora', name: teamResult.winningTeam?.players.map((p) => p.name).join(' / ') || '—', points: teamResult.winningTeam?.totalPoints ?? 0, handicap: teamResult.winningTeam?.handicap ?? 0 },
                  { label: teamResult.isTie ? 'Empate' : 'Perdedora', name: teamResult.losingTeam?.players.map((p) => p.name).join(' / ') || '—', points: teamResult.losingTeam?.totalPoints ?? 0, handicap: teamResult.losingTeam?.handicap ?? 0 },
                  { text: teamResult.displayText || (teamResult.isTie ? '0' : `+${teamResult.margin}`), label: teamResult.isTie ? 'empate' : 'diferencia' },
                )}
              </div>
            </div>
          )}

          {isStablefordMode && (
            <div
              className={`mb-8 transition-all duration-1000 ${
                animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
              }`}
            >
              {renderPodiumGrid()}
            </div>
          )}

          {/* HIGHLIGHTS CARDS */}
          <div
            className={`grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6 transition-all duration-1000 delay-300 ${
              animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
            }`}
          >
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-3 shadow-xl transform transition-all hover:scale-105 hover:rotate-1">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-white/20 p-1.5 rounded-lg">
                  <Target size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-white/80 text-[11px] leading-tight font-semibold uppercase tracking-wide">Mejor Hoyo</p>
                  <p className="text-white font-black text-xs leading-tight">Individual</p>
                </div>
              </div>
              <p className="text-white text-base font-black leading-tight break-words">{namesOf(bestIndividualHoles)}</p>
              <p className="text-blue-100 text-sm font-semibold">{bestIndividualHoles.map(entry => `${entry.playerName}: Hoyo ${entry.bestHole.holeNumber}`).join(' · ')} · {bestIndividualHoles[0]?.bestHole.points} pts</p>
            </div>

            <div className="bg-gradient-to-br from-rose-500 to-rose-600 rounded-xl p-3 shadow-xl transform transition-all hover:scale-105 hover:rotate-1">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-white/20 p-1.5 rounded-lg">
                  <TrendingDown size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-white/80 text-[11px] leading-tight font-semibold uppercase tracking-wide">Peor Hoyo</p>
                  <p className="text-white font-black text-xs leading-tight">Momento Difícil</p>
                </div>
              </div>
              <p className="text-white text-base font-black leading-tight break-words">{namesOf(worstIndividualHoles)}</p>
              <p className="text-rose-100 text-sm font-semibold">{worstIndividualHoles.map(entry => `${entry.playerName}: Hoyo ${entry.worstHole.holeNumber}`).join(' · ')} · {worstIndividualHoles[0]?.worstHole.points} pts</p>
            </div>

            <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-3 shadow-xl transform transition-all hover:scale-105 hover:rotate-1">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-white/20 p-1.5 rounded-lg">
                  <Flame size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-white/80 text-[11px] leading-tight font-semibold uppercase tracking-wide">Máquina</p>
                  <p className="text-white font-black text-xs leading-tight">Birdie King</p>
                </div>
              </div>
              <p className="text-white text-base font-black leading-tight break-words">{namesOf(birdieKings)}</p>
              <p className="text-amber-100 text-sm font-semibold">{birdieKings[0]?.birdies} birdies</p>
            </div>

            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-3 shadow-xl transform transition-all hover:scale-105 hover:rotate-1">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-white/20 p-1.5 rounded-lg">
                  <Activity size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-white/80 text-[11px] leading-tight font-semibold uppercase tracking-wide">Montaña Rusa</p>
                  <p className="text-white font-black text-xs leading-tight">Mayor Variación</p>
                </div>
              </div>
              <p className="text-white text-base font-black leading-tight break-words">{namesOf(rollerCoasters)}</p>
              <p className="text-purple-100 text-sm font-semibold">Diferencia: {rollerCoasters[0]?.variability} pts</p>
            </div>

            <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-3 shadow-xl transform transition-all hover:scale-105 hover:rotate-1">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-white/20 p-1.5 rounded-lg">
                  <TrendingDown size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-white/80 text-[11px] leading-tight font-semibold uppercase tracking-wide">Más Bogeys</p>
                  <p className="text-white font-black text-xs leading-tight">Rey de +1</p>
                </div>
              </div>
              <p className="text-white text-base font-black leading-tight break-words">{namesOf(bogeyKings)}</p>
              <p className="text-orange-100 text-sm font-semibold">{bogeyKings[0]?.bogeys} bogeys</p>
            </div>

            <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-3 shadow-xl transform transition-all hover:scale-105 hover:rotate-1">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-white/20 p-1.5 rounded-lg">
                  <TrendingDown size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-white/80 text-[11px] leading-tight font-semibold uppercase tracking-wide">Más Doble Bogeys</p>
                  <p className="text-white font-black text-xs leading-tight">Rey del Bosque</p>
                </div>
              </div>
              <p className="text-white text-base font-black leading-tight break-words">{namesOf(doubleBogeyKings)}</p>
              <p className="text-red-100 text-sm font-semibold">{doubleBogeyKings[0]?.doubleBogeyPlus} doble bogeys+</p>
            </div>
          </div>

          {renderStatisticsDetails()}

        </div> {/* FIN DE statsContainerRef */}

        {/* PLANTILLA OCULTA DE ESCRITORIO (EXCLUSIVA PARA CAPTURA/IMAGEN) */}
        <div
          data-statistics-export-wrapper
          aria-hidden="true"
          className="fixed top-0 left-[-10000px] w-[1200px] h-auto overflow-visible pointer-events-none"
        >
          <div 
            ref={desktopExportRef}
            data-statistics-export
            className="theme-static w-[1200px] p-8 bg-slate-900 text-white rounded-2xl border border-white/10"
          >
            {/* Cabecera del Reporte Dinámica */}
            <div className="text-center mb-8 border-b border-white/10 pb-4">
              <h1 className="text-4xl font-black text-white tracking-wider">
                ESTADÍSTICAS · {getModeLabel(gameMode).toUpperCase()}
              </h1>
              <p className="text-emerald-400 font-bold text-lg mt-1">
                {course?.name} · {new Date(roundData?.round?.created_at || Date.now()).toLocaleDateString('es-ES')}
              </p>
            </div>

            {/* Resultado Principal Dinámico según Modalidad */}
            {isMatchMode && matchResult && (
              <div className="flex items-center justify-between gap-6 mb-8 bg-slate-800/80 p-6 rounded-2xl border border-red-500/30">
                <div className="flex-1 text-center bg-amber-500/20 p-6 rounded-xl border-2 border-amber-400">
                  <span className="text-amber-300 text-xs font-black uppercase">{matchResult.isTie ? 'Empate' : 'Ganador'}</span>
                  <h2 className="text-3xl font-black text-white mt-1">{matchResult.winner?.name || '—'}</h2>
                  <p className="text-sm font-bold text-amber-200">HCP {matchResult.winner?.playing_handicap ?? 0}</p>
                  <p className="text-5xl font-black text-amber-400 mt-2">{matchResult.winnerPoints} <span className="text-sm">pts</span></p>
                </div>

                <div className="text-center px-4">
                  <div className="bg-red-600 text-white font-black text-2xl px-6 py-2 rounded-xl">VS</div>
                  <p className="text-white font-bold text-lg mt-2">{matchResult.isTie ? '0' : `+${matchResult.margin}`} <span className="text-xs text-white/60">{matchResult.isTie ? 'emp' : 'dif'}</span></p>
                </div>

                <div className="flex-1 text-center bg-slate-700/40 p-6 rounded-xl border border-slate-600">
                  <span className="text-slate-400 text-xs font-black uppercase">{matchResult.isTie ? 'Empate' : 'Perdedor'}</span>
                  <h2 className="text-3xl font-black text-white mt-1">{matchResult.loser?.name || '—'}</h2>
                  <p className="text-sm font-bold text-slate-300">HCP {matchResult.loser?.playing_handicap ?? 0}</p>
                  <p className="text-5xl font-black text-white mt-2">{matchResult.loserPoints} <span className="text-sm">pts</span></p>
                </div>
              </div>
            )}

            {isParejasMode && teamResult && (
              <div className="flex items-stretch justify-between gap-6 mb-8 bg-slate-800/80 p-6 rounded-2xl border border-blue-500/30">
                <div className="flex-1 text-center bg-amber-500/20 p-6 rounded-xl border-2 border-amber-400 flex flex-col justify-between">
                  <div>
                    <span className="text-amber-300 text-xs font-black uppercase">{teamResult.isTie ? 'Empate' : 'Pareja Ganadora'}</span>
                    <div className="min-h-[3.5rem] flex items-center justify-center my-2">
                      <h2 className="text-2xl font-black text-white leading-tight line-clamp-2">
                        {teamResult.isTie
                          ? `${teamResult.winningTeam?.players.map((p) => p.name).join(' / ') || '—'} / ${teamResult.losingTeam?.players.map((p) => p.name).join(' / ') || '—'}`
                          : teamResult.winningTeam?.players.map((p) => p.name).join(' / ') || '—'}
                      </h2>
                      <p className="text-sm font-bold text-amber-200">HCP {teamResult.winningTeam?.handicap ?? 0}</p>
                    </div>
                  </div>
                  <p className="text-5xl font-black text-amber-400 mt-auto">{teamResult.winningTeam?.totalPoints ?? teamResult.losingTeam?.totalPoints ?? 0} <span className="text-sm">pts</span></p>
                </div>

                <div className="text-center px-4 flex flex-col justify-center items-center">
                  <div className="bg-blue-600 text-white font-black text-2xl px-6 py-2 rounded-xl">VS</div>
                  <p className="text-white font-bold text-lg mt-2">{teamResult.isTie ? '0' : `+${teamResult.margin}`} <span className="text-xs text-white/60">{teamResult.isTie ? 'emp' : 'dif'}</span></p>
                </div>

                <div className="flex-1 text-center bg-slate-700/40 p-6 rounded-xl border border-slate-600 flex flex-col justify-between">
                  <div>
                    <span className="text-slate-400 text-xs font-black uppercase">{teamResult.isTie ? 'Empate' : 'Pareja Perdedora'}</span>
                    <div className="min-h-[3.5rem] flex items-center justify-center my-2">
                      <h2 className="text-2xl font-black text-white leading-tight line-clamp-2">
                        {teamResult.isTie
                          ? `${teamResult.winningTeam?.players.map((p) => p.name).join(' / ') || '—'} / ${teamResult.losingTeam?.players.map((p) => p.name).join(' / ') || '—'}`
                          : teamResult.losingTeam?.players.map((p) => p.name).join(' / ') || '—'}
                      </h2>
                      <p className="text-sm font-bold text-slate-300">HCP {teamResult.losingTeam?.handicap ?? 0}</p>
                    </div>
                  </div>
                  <p className="text-5xl font-black text-white mt-auto">{teamResult.losingTeam?.totalPoints ?? teamResult.winningTeam?.totalPoints ?? 0} <span className="text-sm">pts</span></p>
                </div>
              </div>
            )}

            {(isStablefordMode || isSindicatoMode) && (
              <div className="grid grid-cols-3 gap-6 mb-8">
                {ranking.map((entry, index) => ({ entry, index, position: rankingPosition(index) })).filter(item => item.position <= 3).map(({ entry, index, position }) => (
                  <div 
                    key={entry.player.id} 
                    className={`p-6 rounded-2xl border-2 text-center ${
                      position === 1
                        ? 'bg-amber-500/20 border-yellow-400'
                        : position === 2
                        ? 'bg-slate-700/40 border-slate-400' 
                        : 'bg-orange-600/20 border-orange-400'
                    }`}
                  >
                    <span className="text-xs font-black uppercase tracking-wider text-slate-300">
                      Puesto {position}
                    </span>
                    <h2 className="text-2xl font-black text-white mt-1">{entry.player.name}</h2>
                    <p className="text-4xl font-black text-emerald-400 mt-2">{entry.totalPoints} <span className="text-sm">pts</span></p>
                  </div>
                ))}
              </div>
            )}

            {/* Grid de Destacados */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-blue-600/30 border border-blue-500 p-4 rounded-xl">
                <p className="text-blue-300 text-xs font-bold uppercase">Mejor Hoyo</p>
                <h4 className="text-xl font-black text-white mt-1">{namesOf(bestIndividualHoles)}</h4>
                <p className="text-blue-200 font-bold">{bestIndividualHoles.map(entry => `${entry.playerName}: Hoyo ${entry.bestHole.holeNumber}`).join(' · ')} · {bestIndividualHoles[0]?.bestHole.points} pts</p>
              </div>

              <div className="bg-rose-600/30 border border-rose-500 p-4 rounded-xl">
                <p className="text-rose-300 text-xs font-bold uppercase">Peor Hoyo</p>
                <h4 className="text-xl font-black text-white mt-1">{namesOf(worstIndividualHoles)}</h4>
                <p className="text-rose-200 font-bold">{worstIndividualHoles.map(entry => `${entry.playerName}: Hoyo ${entry.worstHole.holeNumber}`).join(' · ')} · {worstIndividualHoles[0]?.worstHole.points} pts</p>
              </div>

              <div className="bg-amber-600/30 border border-amber-500 p-4 rounded-xl">
                <p className="text-amber-300 text-xs font-bold uppercase">Birdie King</p>
                <h4 className="text-xl font-black text-white mt-1">{namesOf(birdieKings)}</h4>
                <p className="text-amber-200 font-bold">{birdieKings[0]?.birdies} birdies</p>
              </div>

              <div className="bg-purple-600/30 border border-purple-500 p-4 rounded-xl">
                <p className="text-purple-300 text-xs font-bold uppercase">Montaña Rusa</p>
                <h4 className="text-xl font-black text-white mt-1">{namesOf(rollerCoasters)}</h4>
                <p className="text-purple-200 font-bold">Diferencia: {rollerCoasters[0]?.variability} pts</p>
              </div>

              <div className="bg-orange-600/30 border border-orange-500 p-4 rounded-xl">
                <p className="text-orange-300 text-xs font-bold uppercase">Rey de +1</p>
                <h4 className="text-xl font-black text-white mt-1">{namesOf(bogeyKings)}</h4>
                <p className="text-orange-200 font-bold">{bogeyKings[0]?.bogeys} bogeys</p>
              </div>

              <div className="bg-red-600/30 border border-red-500 p-4 rounded-xl">
                <p className="text-red-300 text-xs font-bold uppercase">Rey del Bosque</p>
                <h4 className="text-xl font-black text-white mt-1">{namesOf(doubleBogeyKings)}</h4>
                <p className="text-red-200 font-bold">{doubleBogeyKings[0]?.doubleBogeyPlus} dobles+</p>
              </div>
            </div>

            {renderStatisticsDetails(true)}

          </div>
        </div>

      </div>

      {!isSharedView && showDeleteConfirm && (
        <ConfirmModal
          message={isLinkedPlayer
            ? '¿Descartar esta partida? Dejará de aparecer en tus partidas y estadísticas. El resto de jugadores la seguirá viendo.'
            : '¿Eliminar las estadísticas de esta partida? Se borrará la partida junto con todos sus golpes y resultados. Esta acción no se puede deshacer y las estadísticas no se podrán regenerar.'}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
};
