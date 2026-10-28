export interface GolfHole {
  id: string;
  course_id: string;
  hole_number: number;
  par: 3 | 4 | 5 | 6;
  stroke_index: number;
  created_at: string;
  updated_at: string;
}

export interface Hole {
  number: number;
  par: 3 | 4 | 5 | 6;
  strokeIndex: number;
}

export interface GameState {
  [key: string]: unknown;
}

export interface GolfCourse {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  catalog_key?: string | null;
  catalog_field?: string | null;
  catalog_route?: string | null;
  autonomous_community?: string | null;
  province?: string | null;
}

export interface Tee {
  id: string;
  course_id: string;
  name: string;
  color: string;
  slope_18: number;
  slope_9_i: number;
  slope_9_ii: number;
  created_at: string;
}

export interface Group {
  id: string;
  name?: string;
  group_code: string;
  created_at: string;
  created_by?: string;
  hoyo_19_enabled?: boolean;
  max_players?: number;
  premium_branding?: boolean;
  weekend_mode_until?: string | null;
  group_type?: string;
  archived_at?: string | null;
}

export type PlanType = 'express' | 'player' | 'team' | 'premium';

export interface UserProfile {
  id: string;
  user_id: string;
  nick: string;
  display_name?: string | null;
  avatar_url?: string;
  exact_handicap: number;
  default_tee: string;
  country?: string | null;
  postal_code?: string | null;
  age?: number | null;
  accepted_terms: boolean;
  created_at: string;
  updated_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string | null;
  role: 'admin' | 'member';
  is_guest?: boolean;
  invited_by?: string;
  joined_at: string;
  profile?: Pick<UserProfile, 'nick' | 'display_name' | 'avatar_url'>;
  member_revision: number;
  player_id: string;
  player_revision: number;
  handicap_18: number | null;
  can_manage: boolean;
  can_remove: boolean;
}

export interface GroupInvitation {
  id: string;
  group_id: string;
  invited_user_id: string;
  invited_by: string;
  status: 'pending' | 'accepted' | 'rejected';
  message?: string;
  created_at: string;
  responded_at?: string;
  group?: Group;
  inviter_profile?: UserProfile;
}

export interface QuickRoundInvitation {
  id: string;
  round_id: string;
  round_player_id: string;
  invited_user_id: string;
  invited_by: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  inviter_nick: string;
  course_name: string;
  played_at: string;
}

export interface ProShopPurchase {
  id: string;
  group_id: string;
  purchased_by: string;
  product_type: 'extra_players' | 'premium_branding' | 'weekend_mode';
  amount_paid: number;
  payment_method: 'lightning' | 'stripe';
  payment_ref?: string;
  status: 'pending' | 'completed' | 'failed';
  active_until?: string;
  created_at: string;
}

export interface Player {
  quick_suggestion?: boolean;
  is_guest?: boolean;
  can_manage?: boolean;
  auth_user_id?: string | null;
  handicap_pending?: boolean;
  unavailable_reason?: string | null;
  member_revision?: number;
  id: string;
  name: string;
  exact_handicap: number;
  exact_handicap_18?: number;
  created_at: string;
  updated_at: string;
}

export interface RealtimeEvent {
  eventType: string;
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}

export interface RoundPlayer {
  is_guest?: boolean;
  id: string;
  round_id: string;
  user_id?: string;
  player_id?: string;
  name: string;
  exact_handicap: number;
  exact_handicap_18?: number;
  playing_handicap: number;
  created_at: string;
}

export interface RoundScore {
  id: string;
  round_id: string;
  player_id: string;
  hole_number: number;
  gross_strokes: number;
  strokes_received: number;
  net_strokes: number;
  stableford_points: number;
  no_paso_rojas: boolean;
  spanish_hands?: boolean;
  abandoned: boolean;
  mode_points: number;
  created_at: string;
  updated_at: string;
}

export interface ScoreChangeInput {
  grossStrokes?: number;
  gross_strokes?: number;
  strokesReceived?: number;
  strokes_received?: number;
  netStrokes?: number;
  net_strokes?: number;
  stablefordPoints?: number;
  stableford_points?: number;
  mode_points?: number;
  no_paso_rojas?: boolean;
  spanish_hands?: boolean;
  abandoned?: boolean;
}

export interface ArchivedRoundRanking {
  position: number;
  player_name: string;
  playerName?: string;
  player_id?: string | null;
  player_db_id?: string | null;
  points: number;
  total_points?: number;
  hcp_juego?: number;
  handicap?: number;
  exactHandicap?: number;
  game_mode?: GameMode;
  is_guest?: boolean;
}

export interface ArchivedHoleResults {
  eagles?: number;
  birdies?: number;
  pars?: number;
  bogeys?: number;
  double_bogeys?: number;
  triple_bogey_plus?: number;
  triple_bogeys_plus?: number;
}

export interface ArchivedPlayerStat {
  player_name: string;
  player_id?: string | null;
  course_name?: string;
  played_at?: string;
  best_score?: number;
  worst_score?: number;
  player_db_id?: string | null;
  playingHandicap?: number;
  handicap?: number;
  no_paso_rojas_count?: number;
  spanish_hands_count?: number;
  total_holes_played?: number;
  beers_won?: number;
  beers_paid?: number;
  is_guest?: boolean;
  hole_results?: ArchivedHoleResults | null;
}

export interface ArchivedHoleScore {
  player_id?: string | null;
  player_name: string;
  hole_number: number;
  par: number;
  gross_strokes: number;
  net_strokes: number;
  stableford_points: number;
  no_paso_rojas?: boolean;
  spanish_hands?: boolean;
}

export interface ArchivedRound {
  id: string;
  group_id: string;
  source_round_id?: string | null;
  course_name: string;
  played_at: string;
  final_ranking: ArchivedRoundRanking[];
  player_stats?: ArchivedPlayerStat[] | null;
  hole_scores?: ArchivedHoleScore[] | null;
  game_mode?: GameMode | null;
  num_holes?: number;
  holes_range?: '1-9' | '10-18' | null;
  total_players?: number;
  decided_result?: DecidedResult | null;
}

export interface ArchivedDailyRanking {
  game_player_id?: string | null;
  player_name: string;
  position: number;
  hcp_juego: number;
  total_points: number;
  no_paso_rojas_count: number;
  is_guest?: boolean;
}

export interface DailyRankingStanding {
  playerId: string;
  playerDbId?: string | null;
  playerName: string;
  playingHandicap: number;
  totalPoints: number;
  roundId: string;
  noPasoRojasHoles: number[];
  isGuest: boolean;
}

export interface DailyRanking {
  date: string;
  standings: DailyRankingStanding[];
}

export interface DailyRankingHistoryRow {
  id: string;
  group_id: string;
  ranking_date: string;
  player_id: string;
  player_name: string;
  position: number;
  hcp_juego: number | null;
}

export interface HandicapHistoryEntry {
  date: string;
  handicaps: Record<string, { newHandicap: number; playingHandicap: number }>;
  playerNames: string[];
}

export interface PlayerStatisticsSummary {
  totalRounds: number;
  totalPoints: number;
  averagePoints: number;
  averagePosition: number;
  wins: number;
  podiums: number;
  beersWon: number;
  beersPaid: number;
}

export interface GroupPlayerStatistics {
  name: string;
  totalRounds: number;
  totalPoints: number;
  averagePoints: number;
  wins: number;
  podiums: number;
  beersWon: number;
  beersPaid: number;
  beerBalance: number;
}

export interface GroupStatisticsSummary {
  totalRounds: number;
  playerStats: GroupPlayerStatistics[];
}

export interface CoursePlayerStatistics {
  name: string;
  averageScore: number;
  totalRounds: number;
}

export interface CourseStatisticsSummary {
  courseName: string;
  totalRounds: number;
  averageWinningScore: number;
  highestScore: number;
  lowestScore: number;
  topPlayers: CoursePlayerStatistics[];
}

export interface DetailedPlayerStatistics {
  total_holes_played: number;
  current_handicap: number;
  best_round: { points: number; course: string; date: string } | null;
  hole_results: {
    eagles: number;
    birdies: number;
    pars: number;
    bogeys: number;
    double_bogeys: number;
    triple_bogeys_plus: number;
  };
}

export interface Season {
  id: string;
  group_id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  created_at: string;
}

export interface RankingRpcRow {
  player_name: string;
  player_id?: string | null;
  position?: number;
  total_beers_paid?: number;
  total_beers_won?: number;
  total_rounds?: number;
  avg_handicap?: number | null;
  handicap?: number | null;
  player_handicap?: number | null;
  no_paso_rojas_count?: number;
  total_wins?: number;
  total_eagles?: number;
  total_birdies?: number;
  total_bogeys?: number;
  total_double_bogeys_plus?: number;
  total_rounds_played?: number;
  [key: string]: string | number | boolean | null | undefined;
}

export interface HolePerformanceStatistics {
  hole_number: number;
  par: number;
  total_bad_scores?: number;
  total_good_scores?: number;
  total_plays: number;
  bogeys?: number;
  double_bogeys?: number;
  triple_or_worse?: number;
  eagles?: number;
  birdies?: number;
}

export interface BestCourseRoundStatistics {
  player_name: string;
  best_score: number;
  played_at: string;
}

export interface CompletedRoundSummary {
  id: string;
  group_id: string | null;
  user_id: string;
  course_name: string;
  completed_at: string;
  num_holes: number;
  use_slope: boolean;
  player_stats: ArchivedPlayerStat[];
  total_players: number;
}

export type QuickPlayRoundHeader = Pick<
  GolfRound,
  'id' | 'course_id' | 'num_holes' | 'holes_range' | 'use_slope' | 'game_mode' | 'status' | 'reference_number' | 'created_at'
> & Partial<GolfRound>;

export interface QuickPlayCompletedRound {
  round: QuickPlayRoundHeader;
  holes: GolfHole[];
  players: RoundPlayer[];
  scores: RoundScore[];
  course: GolfCourse | null;
  isCreator: boolean;
  accessMode?: string;
}

export interface QuickPlayPlayerRanking {
  player: RoundPlayer;
  totalStablefordPoints: number;
  totalModePoints: number;
  totalPoints: number;
  doubleBogeysOrWorse: number;
  noPasoRojasCount: number;
  holeInOnes: number;
  playerScores: RoundScore[];
}

export interface QuickPlayTeamRanking {
  team: 0 | 1;
  players: RoundPlayer[];
  totalPoints: number;
  handicap: number;
  label: string;
}

export interface QuickPlaySpecialAwards {
  reyDelBosque: { player: RoundPlayer; count: number } | null;
  noPasoRojas: { player: RoundPlayer; count: number } | null;
  holeInOne: { players: Array<{ player: RoundPlayer; count: number }> } | null;
  hoyoMuerte: { holeNumber: number; par: number; avgPoints: number } | null;
  hoyoGloria: { holeNumber: number; par: number; avgPoints: number } | null;
  laPaliza: {
    winner: RoundPlayer;
    winnerPoints: number;
    loser: RoundPlayer;
    loserPoints: number;
    difference: number;
  } | null;
}

export interface QuickPlayAwardsSummary {
  ranking: QuickPlayPlayerRanking[];
  awards: QuickPlaySpecialAwards;
  matchResult?: {
    winner: RoundPlayer | null;
    loser: RoundPlayer | null;
    winnerPoints: number;
    loserPoints: number;
    margin: number;
    displayText: string | null;
  };
  teamRanking?: QuickPlayTeamRanking[];
  teamResult?: {
    isTie: boolean;
    winningTeam: QuickPlayTeamRanking | null;
    losingTeam: QuickPlayTeamRanking | null;
    margin: number;
    displayText: string | null;
  };
}

export type GameMode = 'stableford' | 'match' | 'sindicato' | 'parejas';
export type UserTier = 'Express' | 'Player' | 'Team';

export interface DecidedResult {
  mode: Exclude<GameMode, 'stableford'>;
  winner_player_ids: string[];
  winner_names: string[];
  winner_label: string;
  margin: number;
  holes_remaining: number;
  display_text: string;
}

export interface GolfRound {
  id: string;
  course_id: string;
  created_by: string;
  user_id: string;
  responsible_user_id?: string | null;
  decided_result?: DecidedResult | null;
  decided_at?: string | null;
  group_id?: string;
  num_holes: 9 | 18;
  holes_range?: '1-9' | '10-18';
  use_slope: boolean;
  tee_id?: string;
  manual_slope?: number;
  game_mode: GameMode;
  status: 'active' | 'completed' | 'archived' | 'cancelled';
  reference_number: number;
  access_code: string;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface RoundWithDetails {
  round: GolfRound;
  holes: GolfHole[];
  players: RoundPlayer[];
  scores: RoundScore[];
}

export interface PlayerStats {
  playerId: string;
  playerName: string;
  totalPoints: number;
  scoresEntered: number;
  totalHoles: number;
}

export type RoundStatus = 'active' | 'completed' | 'archived' | 'cancelled';
