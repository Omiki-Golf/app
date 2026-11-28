import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Flag, Pause, Play, Swords, Trophy } from 'lucide-react';
import { TopBar } from '../TopBar';
import { NavigationButton } from '../NavigationButton';
import { ConfirmModal } from '../ConfirmModal';
import { WriteButton } from '../../context/ReadOnlyContext';
import { CourseCatalogPicker } from '../CourseCatalogPicker';
import { SelectMenu } from '../SelectMenu';
import { golfService } from '../../services/golfService';
import {
  CUP_TITLE, cupMatchName, cupRoundCount, cupSeries, cupService, cupStatusLabel, isCupBye, isCupOpen, isCupPlayable, isCupTieError,
  type CupEntrant, type CupMatch, type CupView,
} from '../../services/cupService';
import { getErrorMessage } from '../../utils/errorMessage';
import type { GolfCourse, Tee } from '../../types';
import { CupBracket } from './CupBracket';
import { CupDraw, CupPlayers, CupSettings } from './CupSetup';

type Tab = 'mine' | 'bracket' | 'matches' | 'players' | 'settings';

interface CupScreenProps {
  editionId: string;
  onBack: () => void;
  /** Abre la tarjeta Match Play de una partida de Copa. */
  onPlayRound: (roundId: string, groupId: string) => void;
  messagesButton?: React.ReactNode;
}

const primary = 'rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60';
const secondary = 'rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink-2 transition-colors hover:bg-card-2 disabled:opacity-60';
const input = 'w-full rounded-lg border-2 border-line-2 bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none';
const dateText = (value: string | null) => value ? new Date(value).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '';

function Alert({ text }: { text: string }) {
  return text ? <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700">{text}</p> : null;
}

/** Elegir campo y recorrido, y abrir la tarjeta Match Play (18 hoyos, PJ de la Copa). */
function StartGame({ match, groupId, onPlayRound }: { match: CupMatch; groupId: string; onPlayRound: CupScreenProps['onPlayRound'] }) {
  const [courses, setCourses] = useState<GolfCourse[]>([]);
  const [course, setCourse] = useState<string | null>(null);
  const [tees, setTees] = useState<Tee[]>([]);
  const [tee, setTee] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { golfService.getCourses().then(setCourses).catch(() => setError('No se han podido cargar los campos.')); }, []);
  useEffect(() => {
    setTee(''); setTees([]);
    if (course) golfService.getTees(course).then(setTees).catch(() => undefined);
  }, [course]);
  const start = async () => {
    if (!course) return;
    setBusy(true); setError('');
    try { onPlayRound(await cupService.startGame(match.id, course, tee || null), groupId); }
    catch (cause) { setError(getErrorMessage(cause, 'No se ha podido abrir la partida.')); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 rounded-xl border border-line bg-card-2 p-3">
      <p className="text-xs text-ink-3">Match Play a 18 hoyos con los PJ de la Copa. Quien abre la tarjeta apunta y la finaliza.</p>
      <CourseCatalogPicker courses={courses} selectedCourseId={course} onSelect={setCourse} onUnavailable={() => setError('Este recorrido todavía no está incorporado a la base de datos.')} />
      {tees.length > 0 && (
        <SelectMenu ariaLabel="Barras de salida" value={tee} onChange={setTee}
          options={[{ value: '', label: 'Barras de salida (opcional)' }, ...tees.map(item => ({ value: item.id, label: item.name }))]} />
      )}
      <WriteButton type="button" disabled={busy || !course} onClick={() => void start()} className={`${primary} w-full`}>
        <Play size={16} className="mr-1 inline" aria-hidden="true" />{busy ? 'Abriendo…' : 'Empezar partida'}
      </WriteButton>
      <Alert text={error} />
    </div>
  );
}

/** Registrar una partida finalizada; si hubo empate tras 18 hoyos, pide la muerte súbita. */
function RecordRound({ roundId, match, entrants, onChanged }: { roundId: string; match: CupMatch; entrants: Map<string, CupEntrant>; onChanged: () => Promise<void> }) {
  const [tie, setTie] = useState(false);
  const [winner, setWinner] = useState('');
  const [hole, setHole] = useState('19');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const record = async (withTie: boolean) => {
    setBusy(true); setError('');
    try {
      await cupService.recordRound(roundId, withTie ? winner : null, withTie ? Number(hole) : null);
      await onChanged();
    } catch (cause) {
      if (isCupTieError(cause)) setTie(true);
      else setError(getErrorMessage(cause, 'No se ha podido registrar el resultado.'));
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 rounded-xl border-2 border-amber-400 bg-card p-3">
      <p className="text-sm font-semibold text-ink">Partida finalizada pendiente de registrar</p>
      {tie ? (
        <>
          <p className="text-xs text-ink-2">Empate tras 18 hoyos: se resuelve a muerte súbita. Indica quién la ganó y en qué hoyo.</p>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <SelectMenu ariaLabel="Ganador de la muerte súbita" value={winner} onChange={setWinner} placeholder="Ganador…"
              options={[match.entrant_a, match.entrant_b].flatMap(id => id ? [{ value: id, label: entrants.get(id)?.name ?? '' }] : [])} />
            <input aria-label="Hoyo decisivo" inputMode="numeric" value={hole} onChange={event => setHole(event.target.value.replace(/\D/g, '').slice(0, 2))} className="w-20 rounded-2xl border border-line bg-card px-2 py-3 text-center text-sm shadow-card" />
          </div>
          <WriteButton type="button" disabled={busy || !winner || Number(hole) < 19 || Number(hole) > 40} onClick={() => void record(true)} className={`${primary} w-full`}>Registrar muerte súbita</WriteButton>
        </>
      ) : (
        <WriteButton type="button" disabled={busy} onClick={() => void record(false)} className={`${primary} w-full`}>{busy ? 'Registrando…' : 'Registrar resultado'}</WriteButton>
      )}
      <Alert text={error} />
    </div>
  );
}

/** Tarjeta de un cruce: jugadores, PJ, serie, plazo y acciones según permisos. */
function MatchCard({ view, match, total, entrants, onPlayRound, onChanged, showActions }: {
  view: CupView; match: CupMatch; total: number; entrants: Map<string, CupEntrant>;
  onPlayRound: CupScreenProps['onPlayRound']; onChanged: () => Promise<void>; showActions: boolean;
}) {
  const a = match.entrant_a ? entrants.get(match.entrant_a) : undefined;
  const b = match.entrant_b ? entrants.get(match.entrant_b) : undefined;
  const [winsA, winsB] = cupSeries(match, view.games);
  const games = view.games.filter(game => game.match_id === match.id);
  const openRound = view.rounds.find(round => round.match_id === match.id);
  const mine = Boolean(view.my_entrant_id && (match.entrant_a === view.my_entrant_id || match.entrant_b === view.my_entrant_id));
  const canPlay = view.edition.status === 'active' && isCupPlayable(match) && (mine || view.can_manage);
  const [panel, setPanel] = useState<'none' | 'start' | 'correct' | 'award' | 'deadline' | 'paper'>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [gameNumber, setGameNumber] = useState(String(games[games.length - 1]?.game_number ?? 1));
  const [winner, setWinner] = useState('');
  const [score, setScore] = useState('');
  const [hole, setHole] = useState('');
  const [note, setNote] = useState('');
  const [deadline, setDeadline] = useState(match.deadline ? match.deadline.slice(0, 10) : '');
  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setBusy(true); setError('');
    try { await action(); setPanel('none'); await onChanged(); }
    catch (cause) { setError(getErrorMessage(cause, fallback)); }
    finally { setBusy(false); }
  };
  const overdue = match.deadline && !match.winner_entrant && Date.parse(match.deadline) < Date.now();
  const status = match.winner_entrant ? (isCupBye(match) ? 'Pase directo' : 'Finalizado')
    : openRound ? (openRound.status === 'active' ? 'En juego' : 'Pendiente de registrar')
    : isCupPlayable(match) ? 'Pendiente' : 'Esperando rival';
  // Dos invitados sin cuenta no pueden llevar la tarjeta en la app: juegan en papel.
  const guestMatch = Boolean(a && b && !a.has_account && !b.has_account);
  const winnerOptions = [match.entrant_a, match.entrant_b].flatMap(id => id ? [{ value: id, label: entrants.get(id)?.name ?? '' }] : []);

  return (
    <article className={`space-y-3 rounded-2xl border-2 bg-card p-4 shadow-card ${mine ? 'border-amber-400' : 'border-line'}`}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold uppercase tracking-wide text-ink-3">{cupMatchName(match, total)} · {match.best_of === 3 ? 'Bo3' : 'Bo1'}</span>
        <span className={`rounded-full px-2 py-0.5 font-semibold ${status === 'En juego' ? 'bg-amber-100 text-amber-800' : 'bg-card-2 text-ink-2'}`}>{status}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
        <div className={match.winner_entrant === match.entrant_a ? 'font-bold text-ink' : 'text-ink-2'}>
          <p className="truncate text-base">{a?.name ?? 'Por decidir'}</p>
          {a && <p className="text-xs text-ink-3">PJ {Number(a.playing_handicap)}</p>}
        </div>
        <p className="text-xl font-bold tabular-nums text-ink">{isCupBye(match) ? '—' : `${winsA}–${winsB}`}</p>
        <div className={match.winner_entrant === match.entrant_b ? 'font-bold text-ink' : 'text-ink-2'}>
          <p className="truncate text-base">{b?.name ?? (isCupBye(match) ? 'Pase directo' : 'Por decidir')}</p>
          {b && <p className="text-xs text-ink-3">PJ {Number(b.playing_handicap)}</p>}
        </div>
      </div>
      {games.length > 0 && (
        <ul className="space-y-1 text-xs text-ink-2">
          {games.map(game => <li key={game.id} className="flex justify-between gap-2 rounded-lg bg-card-2 px-2 py-1">
            <span>Partido {game.game_number}: {entrants.get(game.winner_entrant)?.name}</span>
            <span className="tabular-nums">{game.score}{game.source === 'corrected' ? ' · corregido' : game.source === 'paper' ? ' · tarjeta en papel' : ''}</span>
          </li>)}
        </ul>
      )}
      {match.deadline && !match.winner_entrant && (
        <p className={`flex items-center gap-1 text-xs ${overdue ? 'font-semibold text-red-600' : 'text-ink-3'}`}>
          <CalendarClock size={14} aria-hidden="true" /> Fecha límite: {new Date(match.deadline).toLocaleDateString('es-ES')}{overdue ? ' · vencida' : ''}
        </p>
      )}

      {guestMatch && isCupPlayable(match) && view.edition.status === 'active' && (
        <p className="rounded-xl border border-dashed border-amber-400 bg-card-2 p-3 text-xs text-ink-2">
          Partido entre invitados sin cuenta: juegan en tarjeta de papel y el creador o un administrador anota el resultado.
        </p>
      )}
      {showActions && openRound?.status === 'completed' && (openRound.mine || view.can_manage) && view.edition.status === 'active' && (
        <RecordRound roundId={openRound.id} match={match} entrants={entrants} onChanged={onChanged} />
      )}
      {showActions && canPlay && openRound?.status === 'active' && (openRound.mine || view.can_manage) && (
        <button type="button" onClick={() => onPlayRound(openRound.id, view.edition.group_id)} className={`${primary} w-full`}>
          <Play size={16} className="mr-1 inline" aria-hidden="true" />Continuar partida {openRound.game_number}
        </button>
      )}
      {showActions && canPlay && !openRound && (panel === 'start'
        ? <StartGame match={match} groupId={view.edition.group_id} onPlayRound={onPlayRound} />
        : <WriteButton type="button" onClick={() => setPanel('start')} className={`${primary} w-full`}>
            <Swords size={16} className="mr-1 inline" aria-hidden="true" />{mine ? 'Jugar eliminatoria actual' : 'Jugar esta eliminatoria'}
            {match.best_of === 3 ? ` · partido ${games.length + 1}` : ''}
          </WriteButton>)}

      {showActions && view.can_correct && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-2 text-xs font-semibold">
          {games.length > 0 && <button type="button" className="text-accent-ink underline" onClick={() => setPanel(panel === 'correct' ? 'none' : 'correct')}>Corregir resultado</button>}
          {isCupPlayable(match) && !openRound && view.edition.status === 'active' && <button type="button" className="text-accent-ink underline" onClick={() => { setWinner(''); setScore(''); setHole(''); setPanel(panel === 'paper' ? 'none' : 'paper'); }}>Anotar resultado (tarjeta en papel)</button>}
          {isCupPlayable(match) && !openRound && view.edition.status !== 'finished' && <button type="button" className="text-accent-ink underline" onClick={() => setPanel(panel === 'award' ? 'none' : 'award')}>Adjudicar sin jugar</button>}
          {isCupPlayable(match) && view.edition.status !== 'finished' && <button type="button" className="text-accent-ink underline" onClick={() => setPanel(panel === 'deadline' ? 'none' : 'deadline')}>Fecha límite</button>}
        </div>
      )}
      {panel === 'correct' && (
        <div className="space-y-2 rounded-xl bg-card-2 p-3">
          <p className="text-xs text-ink-3">Solo antes de que empiece el siguiente cruce afectado. Queda en la auditoría de la Copa.</p>
          <div className="grid grid-cols-2 gap-2">
            <SelectMenu ariaLabel="Partido a corregir" value={gameNumber} onChange={setGameNumber}
              options={games.map(game => ({ value: String(game.game_number), label: `Partido ${game.game_number}` }))} />
            <SelectMenu ariaLabel="Ganador correcto" value={winner} onChange={setWinner} placeholder="Ganador…" options={winnerOptions} />
            <input aria-label="Marcador" value={score} onChange={event => setScore(event.target.value)} placeholder="3&2, 1 UP…" className={input} />
            <input aria-label="Hoyo de desempate" inputMode="numeric" value={hole} onChange={event => setHole(event.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Hoyo 19+ (opcional)" className={input} />
          </div>
          <WriteButton type="button" disabled={busy || !winner || !score.trim()} className={`${primary} w-full`}
            onClick={() => void run(() => cupService.correctGame(match.id, Number(gameNumber), winner, score.trim(), hole ? Number(hole) : null), 'No se ha podido corregir el resultado.')}>Guardar corrección</WriteButton>
        </div>
      )}
      {panel === 'paper' && (
        <div className="space-y-2 rounded-xl bg-card-2 p-3">
          <p className="text-xs text-ink-3">
            {match.best_of === 3 ? `Partido ${games.length + 1} de la serie. ` : ''}Anota el resultado de la tarjeta en papel. Si quieres guardar la tarjeta hoyo a hoyo, usa «Jugar esta eliminatoria» y pásala a la app.
          </p>
          <SelectMenu ariaLabel="Ganador del partido" value={winner} onChange={setWinner} placeholder="Ganador…" options={winnerOptions} />
          <div className="grid grid-cols-2 gap-2">
            <input aria-label="Marcador" value={score} onChange={event => setScore(event.target.value)} placeholder="3&2, 1 UP…" className={input} />
            <input aria-label="Hoyo de muerte súbita" inputMode="numeric" value={hole} onChange={event => setHole(event.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Hoyo 19+ (opcional)" className={input} />
          </div>
          <WriteButton type="button" disabled={busy || !winner || !score.trim() || (hole !== '' && (Number(hole) < 19 || Number(hole) > 40))} className={`${primary} w-full`}
            onClick={() => void run(() => cupService.recordPaperGame(match.id, winner, score.trim(), hole ? Number(hole) : null), 'No se ha podido anotar el resultado.')}>Guardar resultado</WriteButton>
        </div>
      )}
      {panel === 'award' && (
        <div className="space-y-2 rounded-xl bg-card-2 p-3">
          <p className="text-xs text-ink-3">Para cruces que no se van a disputar. El ganador pasa de ronda.</p>
          <SelectMenu ariaLabel="Ganador adjudicado" value={winner} onChange={setWinner} placeholder="Ganador…" options={winnerOptions} />
          <input aria-label="Motivo" value={note} onChange={event => setNote(event.target.value)} maxLength={200} placeholder="Motivo (opcional)" className={input} />
          <WriteButton type="button" disabled={busy || !winner} className={`${primary} w-full`}
            onClick={() => void run(() => cupService.awardMatch(match.id, winner, note), 'No se ha podido adjudicar el cruce.')}>Adjudicar</WriteButton>
        </div>
      )}
      {panel === 'deadline' && (
        <div className="flex gap-2 rounded-xl bg-card-2 p-3">
          <input aria-label="Nueva fecha límite" type="date" value={deadline} onChange={event => setDeadline(event.target.value)} className={input} />
          <WriteButton type="button" disabled={busy} className={secondary}
            onClick={() => void run(() => cupService.setDeadline(match.id, deadline ? new Date(`${deadline}T23:59:59`).toISOString() : null), 'No se ha podido guardar la fecha.')}>Guardar</WriteButton>
        </div>
      )}
      <Alert text={error} />
    </article>
  );
}

export const CupScreen: React.FC<CupScreenProps> = ({ editionId, onBack, onPlayRound, messagesButton }) => {
  const [view, setView] = useState<CupView | null>(null);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<Tab | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    try { setView(await cupService.getEdition(editionId)); setLoadError(''); }
    catch (cause) { setLoadError(getErrorMessage(cause, 'No se ha podido cargar la Copa.')); }
  }, [editionId]);
  useEffect(() => { void load(); }, [load]);

  const entrants = useMemo(() => new Map((view?.entrants ?? []).map(entrant => [entrant.id, entrant])), [view]);
  const shell = (content: React.ReactNode) => (
    <div className="min-h-screen bg-app transition-colors">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <TopBar left={<NavigationButton destination="back" onClick={onBack} />} center={messagesButton} />
        {content}
      </div>
    </div>
  );
  if (!view) return shell(loadError ? <Alert text={loadError} /> : <p role="status" className="p-6 text-center text-ink-3">Cargando la Copa…</p>);

  const { edition } = view;
  const published = Boolean(edition.published_at);
  const total = cupRoundCount(view.matches);
  const activeTab: Tab = tab ?? (published ? (view.my_entrant_id ? 'mine' : 'bracket') : 'players');
  const myMatches = view.matches.filter(match => view.my_entrant_id && (match.entrant_a === view.my_entrant_id || match.entrant_b === view.my_entrant_id));
  const current = myMatches.find(match => isCupPlayable(match))
    ?? myMatches.find(match => !match.winner_entrant);
  const eliminated = Boolean(view.my_entrant_id && published && !current);
  const featured = view.matches.find(match => isCupPlayable(match) && view.rounds.some(round => round.match_id === match.id))
    ?? view.matches.find(match => isCupPlayable(match));
  const me = view.my_entrant_id ? entrants.get(view.my_entrant_id) : undefined;
  const champion = edition.champion_entrant_id ? entrants.get(edition.champion_entrant_id) : undefined;
  const final = view.matches.find(match => match.code !== 'third-place' && !match.next_code);
  const runnerUp = final?.winner_entrant ? entrants.get(final.winner_entrant === final.entrant_a ? final.entrant_b! : final.entrant_a!) : undefined;
  const bronze = view.matches.find(match => match.code === 'third-place');
  const semis = view.matches.filter(match => match.code !== 'third-place' && match.round_index === total - 2);
  const tabs: Array<[Tab, string]> = published
    ? [['mine', 'Mi eliminatoria'], ['bracket', 'Cuadro'], ['matches', 'Enfrentamientos'], ['players', 'Jugadores']]
    : [['players', 'Jugadores'], ['settings', view.can_manage ? 'Configuración' : 'Formato']];

  const setStatus = async (status: 'active' | 'paused' | 'cancelled') => {
    setBusy(true); setError('');
    try { await cupService.setStatus(edition.id, status); await load(); }
    catch (cause) { setError(getErrorMessage(cause, 'No se ha podido cambiar el estado de la Copa.')); }
    finally { setBusy(false); }
  };
  const respond = async (accept: boolean) => {
    setBusy(true); setError('');
    try { await cupService.respondRegistration(edition.id, accept); await load(); }
    catch (cause) { setError(getErrorMessage(cause, 'No se ha podido guardar tu respuesta.')); }
    finally { setBusy(false); }
  };
  const card = (match: CupMatch, showActions = true) => (
    <MatchCard key={match.id} view={view} match={match} total={total} entrants={entrants} onPlayRound={onPlayRound} onChanged={load} showActions={showActions} />
  );

  return shell(
    <div className="space-y-4">
      <header className="text-center">
        <p className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-600"><Swords size={14} aria-hidden="true" />{CUP_TITLE}</p>
        <h1 className="mt-1 text-2xl font-bold text-ink">{edition.name}</h1>
        <p className="text-sm text-ink-3">{view.group_name} · {cupStatusLabel[edition.status]}</p>
      </header>

      {champion && (
        <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-center dark:bg-amber-500/10">
          <Trophy size={28} className="mx-auto text-amber-500" aria-hidden="true" />
          <p className="mt-1 text-lg font-bold text-ink">Campeón: {champion.name}</p>
          <p className="text-xs text-ink-2">
            {runnerUp ? `Finalista: ${runnerUp.name}` : ''}
            {bronze?.winner_entrant ? ` · Tercer puesto: ${entrants.get(bronze.winner_entrant)?.name}` : ''}
            {!bronze && semis.length === 2 ? ` · Semifinalistas: ${semis.map(semi => semi.winner_entrant && entrants.get(semi.winner_entrant === semi.entrant_a ? semi.entrant_b! : semi.entrant_a!)?.name).filter(Boolean).join(' y ')}` : ''}
          </p>
        </div>
      )}
      {edition.status === 'paused' && <p role="status" className="rounded-xl bg-card-2 p-3 text-center text-sm text-ink-2"><Pause size={14} className="mr-1 inline" aria-hidden="true" />Copa pausada: el cuadro se puede consultar, pero no admite partidas ni resultados.</p>}
      {edition.status === 'cancelled' && <p role="status" className="rounded-xl bg-card-2 p-3 text-center text-sm text-ink-2">Copa cancelada. Lo jugado se conserva para consulta.</p>}

      {edition.status === 'registration' && me?.registration === 'pending' && (
        <div className="space-y-2 rounded-2xl border-2 border-amber-400 bg-card p-4 text-center">
          <p className="font-semibold text-ink">Te han invitado a esta Copa</p>
          {edition.registration_deadline && <p className="text-xs text-ink-3">Confirma antes del {new Date(edition.registration_deadline).toLocaleDateString('es-ES')}.</p>}
          <div className="grid grid-cols-2 gap-2">
            <WriteButton type="button" disabled={busy} className={secondary} onClick={() => void respond(false)}>No participo</WriteButton>
            <WriteButton type="button" disabled={busy} className={primary} onClick={() => void respond(true)}>Participo</WriteButton>
          </div>
        </div>
      )}

      <nav className={`grid gap-1.5 ${tabs.length > 2 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`} role="tablist" aria-label="Secciones de la Copa">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={activeTab === id} onClick={() => setTab(id)}
            className={`min-w-0 truncate rounded-full border-2 px-2 py-1.5 text-sm font-semibold ${activeTab === id ? 'border-amber-500 bg-amber-400 text-slate-950' : 'border-line bg-card text-ink-2'}`}>{label}</button>
        ))}
      </nav>

      {activeTab === 'mine' && (
        <section aria-label="Mi eliminatoria actual" className="space-y-3">
          {!view.my_entrant_id && <p className="text-sm text-ink-3">No participas en esta Copa.</p>}
          {current && card(current)}
          {current && !isCupPlayable(current) && <p className="text-center text-xs text-ink-3">Tu rival saldrá del cruce anterior.</p>}
          {eliminated && edition.status !== 'cancelled' && (
            <>
              <p className="text-center text-sm text-ink-2">{edition.champion_entrant_id === view.my_entrant_id ? '¡Eres el campeón!' : 'Has quedado eliminado en esta edición.'}</p>
              {featured && <><h2 className="text-sm font-semibold text-ink-3">Cruce de la jornada</h2>{card(featured, false)}</>}
            </>
          )}
        </section>
      )}
      {activeTab === 'bracket' && (
        <CupBracket matches={view.matches} entrants={view.entrants} games={view.games} highlight={view.my_entrant_id} onSelect={() => setTab('matches')} />
      )}
      {activeTab === 'matches' && (
        <section aria-label="Enfrentamientos" className="space-y-4">
          {([['Pendientes y en juego', (match: CupMatch) => isCupPlayable(match)],
            ['Esperando rival', (match: CupMatch) => !match.winner_entrant && !isCupPlayable(match)],
            ['Finalizados', (match: CupMatch) => Boolean(match.winner_entrant) && !isCupBye(match)]] as const).map(([title, filter]) => {
            const list = view.matches.filter(filter);
            return list.length > 0 && <div key={title} className="space-y-2"><h2 className="text-sm font-semibold text-ink-3">{title}</h2>{list.map(match => card(match))}</div>;
          })}
        </section>
      )}
      {activeTab === 'players' && <CupPlayers view={view} onChanged={load} />}
      {activeTab === 'settings' && (
        <div className="space-y-4">
          <CupSettings view={view} onChanged={load} />
          <CupDraw view={view} onChanged={load} />
        </div>
      )}

      {view.can_manage && isCupOpen(edition.status) && (
        <div className="flex flex-wrap justify-center gap-2 border-t border-line pt-4">
          {edition.status === 'active' && <WriteButton type="button" disabled={busy} className={secondary} onClick={() => void setStatus('paused')}><Pause size={14} className="mr-1 inline" aria-hidden="true" />Pausar</WriteButton>}
          {edition.status === 'paused' && <WriteButton type="button" disabled={busy} className={secondary} onClick={() => void setStatus('active')}><Play size={14} className="mr-1 inline" aria-hidden="true" />Reanudar</WriteButton>}
          <WriteButton type="button" disabled={busy} className="rounded-xl border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-600" onClick={() => setConfirmCancel(true)}><Flag size={14} className="mr-1 inline" aria-hidden="true" />Cancelar Copa</WriteButton>
        </div>
      )}
      <Alert text={error} />
      {published && <p className="text-center text-[11px] text-ink-3">Cuadro publicado el {dateText(edition.published_at)}. Los resultados de la Copa no cambian hándicaps, rankings ni estadísticas del grupo.</p>}
      {confirmCancel && (
        <ConfirmModal
          message="¿Cancelar la Copa? La edición quedará cancelada: se conserva lo jugado y podrás contratar otra. No se puede deshacer."
          onConfirm={() => { setConfirmCancel(false); void setStatus('cancelled'); }}
          onCancel={() => setConfirmCancel(false)}
        />
      )}
    </div>
  );
};
