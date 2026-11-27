import { supabase } from './supabaseClient';
import { safeStorage } from '../utils/safeStorage';

// Temporada Simultánea · Copa Match Play. Todo pasa por funciones del servidor, que aplican los permisos.

export type CupStatus = 'draft' | 'registration' | 'draw_ready' | 'active' | 'paused' | 'finished' | 'cancelled';
export type CupDrawMethod = 'random' | 'ranking' | 'handicap' | 'manual';

export const CUP_PRICE = 14.99;
export const CUP_TITLE = 'Temporada Simultánea · Copa Match Play';

export interface CupEdition {
  id: string;
  group_id: string;
  number: number;
  name: string;
  status: CupStatus;
  draw_method: CupDrawMethod | null;
  best_of: 1 | 3;
  final_best_of: 1 | 3;
  third_place: boolean;
  round_days: number | null;
  registration_deadline: string | null;
  draw_slots: (string | null)[] | null;
  champion_entrant_id: string | null;
  published_at: string | null;
  finished_at: string | null;
  cancelled_at: string | null;
  created_at: string;
}

export interface CupEntrant {
  id: string;
  name: string;
  playing_handicap: number;
  is_guest: boolean;
  has_account: boolean;
  registration: 'confirmed' | 'pending' | 'declined';
  rank: number | null;
  player_id: string | null;
  avatar_url: string | null;
}

export interface CupMatch {
  id: string;
  code: string;
  round_index: number;
  position: number;
  best_of: 1 | 3;
  entrant_a: string | null;
  entrant_b: string | null;
  next_code: string | null;
  next_slot: 0 | 1 | null;
  third_slot: 0 | 1 | null;
  winner_entrant: string | null;
  awarded_entrant: string | null;
  award_note: string | null;
  deadline: string | null;
  decided_at: string | null;
}

export interface CupGame {
  id: string;
  match_id: string;
  game_number: number;
  winner_entrant: string;
  score: string;
  decisive_hole: number | null;
  round_id: string | null;
  source: 'played' | 'corrected';
  recorded_at: string;
}

export interface CupOpenRound {
  id: string;
  match_id: string;
  game_number: number;
  status: 'active' | 'completed';
  mine: boolean;
}

export interface CupView {
  edition: CupEdition;
  group_name: string;
  capacity: 20 | 32;
  can_manage: boolean;
  can_correct: boolean;
  my_entrant_id: string | null;
  current_ranks: Record<string, number>;
  entrants: CupEntrant[];
  matches: CupMatch[];
  games: CupGame[];
  rounds: CupOpenRound[];
}

export interface CupOverview {
  is_owner: boolean;
  can_purchase: boolean;
  next_number: number;
  open: { id: string; number: number; name: string; status: CupStatus; stage: string | null } | null;
  editions: Array<{ id: string; number: number; name: string; status: 'finished' | 'cancelled'; finished_at: string | null; cancelled_at: string | null; champion: string | null }>;
}

export interface CupShortcut {
  group_id: string;
  edition_id: string;
  status: CupStatus;
  name: string;
  group_name: string;
  pending: boolean;
  invited: boolean;
}

export interface CupRecordResult { game_id: string; winner: string; score: string; replayed: boolean }

/** Error de la base con la pista de empate tras 18 hoyos (hay que indicar la muerte súbita). */
export const isCupTieError = (error: unknown) =>
  Boolean(error && typeof error === 'object' && 'hint' in error && (error as { hint?: string }).hint === 'cup_tie');

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

// Clave de compra: se reutiliza en los reintentos hasta que el pago queda confirmado.
const purchaseKeyStorage = (groupId: string) => `omiki.cup.purchase.${groupId}`;

export const cupService = {
  async purchase(groupId: string): Promise<{ edition_id: string; replayed: boolean }> {
    const storageKey = purchaseKeyStorage(groupId);
    let key = safeStorage.getItem(storageKey);
    if (!key || !/^[0-9a-f-]{36}$/i.test(key)) {
      key = crypto.randomUUID();
      safeStorage.setItem(storageKey, key);
    }
    const result = await rpc<{ edition_id: string; replayed: boolean }>('purchase_cup_edition', { p_group: groupId, p_purchase_key: key });
    safeStorage.removeItem(storageKey);
    return result;
  },
  getEdition: (editionId: string) => rpc<CupView>('get_cup_edition', { p_edition: editionId }),
  getOverview: (groupId: string) => rpc<CupOverview>('get_group_cup_overview', { p_group: groupId }),
  listShortcuts: () => rpc<CupShortcut[]>('list_my_cup_shortcuts', {}),
  updateSettings: (editionId: string, settings: Partial<Pick<CupEdition, 'name' | 'draw_method' | 'best_of' | 'final_best_of' | 'third_place' | 'round_days'>>) =>
    rpc<void>('update_cup_settings', { p_edition: editionId, p_settings: settings }),
  addEntrant: (editionId: string, input: { playerId?: string | null; userId?: string | null; name?: string; handicap: number }) =>
    rpc<string>('add_cup_entrant', { p_edition: editionId, p_player: input.playerId ?? null, p_user: input.userId ?? null, p_name: input.name ?? null, p_handicap: input.handicap }),
  updateEntrant: (entrantId: string, name: string | null, handicap: number) =>
    rpc<void>('update_cup_entrant', { p_entrant: entrantId, p_name: name, p_handicap: handicap }),
  removeEntrant: (entrantId: string) => rpc<void>('remove_cup_entrant', { p_entrant: entrantId }),
  openRegistration: (editionId: string, deadline: string | null) => rpc<void>('open_cup_registration', { p_edition: editionId, p_deadline: deadline }),
  respondRegistration: (editionId: string, accept: boolean) => rpc<void>('respond_cup_registration', { p_edition: editionId, p_accept: accept }),
  saveDraw: (editionId: string, method: CupDrawMethod, slots: (string | null)[]) =>
    rpc<void>('save_cup_draw', { p_edition: editionId, p_method: method, p_slots: slots }),
  discardDraw: (editionId: string) => rpc<void>('discard_cup_draw', { p_edition: editionId }),
  publishDraw: (editionId: string) => rpc<void>('publish_cup_draw', { p_edition: editionId }),
  setStatus: (editionId: string, status: 'active' | 'paused' | 'cancelled' | 'draft') => rpc<void>('set_cup_status', { p_edition: editionId, p_status: status }),
  setDeadline: (matchId: string, deadline: string | null) => rpc<void>('set_cup_match_deadline', { p_match: matchId, p_deadline: deadline }),
  startGame: (matchId: string, courseId: string, teeId: string | null) =>
    rpc<string>('start_cup_game', { p_match: matchId, p_course: courseId, p_tee: teeId }),
  recordRound: (roundId: string, tiebreakWinner: string | null = null, decisiveHole: number | null = null) =>
    rpc<CupRecordResult>('record_cup_round', { p_round: roundId, p_tiebreak_winner: tiebreakWinner, p_decisive_hole: decisiveHole }),
  correctGame: (matchId: string, game: number, winner: string, score: string, decisiveHole: number | null) =>
    rpc<void>('correct_cup_game', { p_match: matchId, p_game: game, p_winner: winner, p_score: score, p_decisive_hole: decisiveHole }),
  awardMatch: (matchId: string, winner: string, note: string) => rpc<void>('award_cup_match', { p_match: matchId, p_winner: winner, p_note: note }),
};

// --- Ayudas de presentación (sin acceso a datos) ---

export const cupStatusLabel: Record<CupStatus, string> = {
  draft: 'Borrador',
  registration: 'Inscripciones abiertas',
  draw_ready: 'Sorteo preparado',
  active: 'En curso',
  paused: 'Pausada',
  finished: 'Finalizada',
  cancelled: 'Cancelada',
};

export const cupDrawLabel: Record<CupDrawMethod, string> = {
  random: 'Sorteo aleatorio',
  ranking: 'Cabezas de serie por ranking',
  handicap: 'Cabezas de serie por PJ',
  manual: 'Emparejamiento manual',
};

/** Rondas del cuadro sin contar el tercer puesto. */
export const cupRoundCount = (matches: readonly CupMatch[]) =>
  matches.filter(match => match.code !== 'third-place').reduce((max, match) => Math.max(max, match.round_index + 1), 0);

export function cupRoundName(roundIndex: number, totalRounds: number): string {
  switch (totalRounds - 1 - roundIndex) {
    case 0: return 'Final';
    case 1: return 'Semifinales';
    case 2: return 'Cuartos de final';
    case 3: return 'Octavos de final';
    case 4: return 'Dieciseisavos de final';
    default: return `Ronda ${roundIndex + 1}`;
  }
}

export const cupMatchName = (match: CupMatch, totalRounds: number) =>
  match.code === 'third-place' ? 'Tercer puesto' : cupRoundName(match.round_index, totalRounds);

/** Victorias de cada jugador en la serie. */
export function cupSeries(match: CupMatch, games: readonly CupGame[]): [number, number] {
  const own = games.filter(game => game.match_id === match.id);
  return [
    own.filter(game => game.winner_entrant === match.entrant_a).length,
    own.filter(game => game.winner_entrant === match.entrant_b).length,
  ];
}

/** Pase directo: cruce de la primera ronda con un solo jugador. */
export const isCupBye = (match: CupMatch) =>
  match.round_index === 0 && match.code !== 'third-place' && (match.entrant_a === null) !== (match.entrant_b === null);

/** Cruce con dos jugadores y sin ganador. */
export const isCupPlayable = (match: CupMatch) => Boolean(match.entrant_a && match.entrant_b && !match.winner_entrant);

export const isCupOpen = (status: CupStatus) => status !== 'finished' && status !== 'cancelled';
