import React from 'react';
import { Hand } from 'lucide-react';
import { GolfRound, RoundPlayer, RoundScore } from '../types';
import { NavigationButton } from './NavigationButton';
import { ThemeToggle } from './ThemeToggle';
import { TopBar } from './TopBar';
import { GamificationBadge } from './GamificationBadge';
import { PlayerName } from './PlayerName';

export interface LeaderboardRound {
  round: GolfRound;
  players: RoundPlayer[];
  scores: RoundScore[];
}

export interface GlobalLeaderboardEntry {
  key: string;
  name: string;
  is_guest?: boolean;
  handicap: number;
  totalPoints: number;
  holesPlayed: number;
  roundName: string;
  noPasoRojasHoles: number[];
  spanishHandsHoles: number[];
  gamificationEvents: Array<{ productId: string; holeNumber: number }>;
}

/** Clasificación de todas las partidas: puntos, hoyos jugados y marcas de gamificación con su hoyo. */
export const buildGlobalLeaderboard = (rounds: LeaderboardRound[]): GlobalLeaderboardEntry[] =>
  rounds
    .flatMap(({ round, players, scores }) => players.map(player => {
      const playerScores = scores.filter(score => score.player_id === player.id);
      const holesOf = (isMarked: (score: RoundScore) => boolean | undefined) =>
        playerScores.filter(score => isMarked(score)).map(score => score.hole_number).sort((a, b) => a - b);
      return {
        key: `${round.id}:${player.id}`,
        name: player.name,
        is_guest: player.is_guest,
        handicap: player.playing_handicap,
        totalPoints: playerScores.reduce((sum, score) => sum + score.stableford_points, 0),
        holesPlayed: playerScores.length,
        roundName: round.num_holes === 9 ? '9 Hoyos' : '18 Hoyos',
        noPasoRojasHoles: holesOf(score => score.no_paso_rojas === true),
        spanishHandsHoles: holesOf(score => score.spanish_hands === true),
        gamificationEvents: playerScores.flatMap(score =>
          (score.gamification_events || []).map(productId => ({ productId, holeNumber: score.hole_number }))
        ),
      };
    }))
    .sort((a, b) => (b.totalPoints !== a.totalPoints ? b.totalPoints - a.totalPoints : a.handicap - b.handicap));

interface GlobalLeaderboardProps {
  rounds: LeaderboardRound[];
  title: string;
  onBack: () => void;
  messagesButton?: React.ReactNode;
}

export const GlobalLeaderboard: React.FC<GlobalLeaderboardProps> = ({ rounds, title, onBack, messagesButton }) => (
  <div>
    <TopBar
      className="mb-3"
      left={<>
        <NavigationButton destination="back" onClick={onBack} />
        <ThemeToggle className="!h-11 !w-11" />
      </>}
      center={messagesButton}
    />

    <h1 className="mb-6 text-center text-3xl font-bold text-title">{title}</h1>

    <div className="bg-card rounded-lg shadow-card p-6">
      <div className="space-y-3">
        {buildGlobalLeaderboard(rounds).map((player, index) => (
          <div
            key={player.key}
            className={`p-4 rounded-lg flex items-center justify-between ${
              index === 0
                ? 'bg-gradient-to-r from-yellow-100 to-yellow-50 border-2 border-yellow-400'
                : index === 1
                ? 'bg-card-2 border-2 border-line-2'
                : index === 2
                ? 'bg-gradient-to-r from-orange-100 to-orange-50 border-2 border-orange-400'
                : 'bg-card-2 border border-line'
            }`}
          >
            <div className="flex items-center gap-4">
              <div
                className={`text-2xl font-bold w-10 h-10 flex items-center justify-center rounded-full ${
                  index === 0
                    ? 'bg-yellow-400 text-yellow-900'
                    : index === 1
                    ? 'bg-ink-4 text-ink'
                    : index === 2
                    ? 'bg-orange-400 text-orange-900'
                    : 'bg-neutral-hover text-ink-2'
                }`}
              >
                {index + 1}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-lg text-ink"><PlayerName name={player.name} />{player.is_guest && <span className="ml-1 text-xs font-normal">(Invitado)</span>}</p>
                  {player.noPasoRojasHoles.length > 0 && (
                    <div className="flex items-center gap-1">
                      {player.noPasoRojasHoles.map((holeNumber) => (
                        <GamificationBadge key={`rojas-${holeNumber}`} productId="no-paso-rojas" size={24} detail={`Hoyo ${holeNumber}`} />
                      ))}
                    </div>
                  )}
                  {player.spanishHandsHoles.length > 0 && (
                    <div className="flex items-center gap-1">
                      {player.spanishHandsHoles.map((holeNumber) => (
                        <span
                          key={`sh-${holeNumber}`}
                          title={`Spanish Hands · Hoyo ${holeNumber}`}
                          className="bg-accent text-on-accent text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-soft"
                        >
                          <Hand size={13} />
                        </span>
                      ))}
                    </div>
                  )}
                  {player.gamificationEvents.map(({ productId, holeNumber }, eventIndex) => (
                    <GamificationBadge key={`${productId}-${holeNumber}-${eventIndex}`} productId={productId} size={24} detail={`Hoyo ${holeNumber}`} />
                  ))}
                </div>
                <p className="text-sm text-ink-3">
                  PJ {player.handicap} • {player.roundName} • {player.holesPlayed} hoyos
                </p>
              </div>
            </div>
            <div className="text-right">
              <p
                className={`text-3xl font-bold ${
                  index === 0
                    ? 'text-yellow-800'
                    : index === 1
                    ? 'text-ink-3'
                    : index === 2
                    ? 'text-orange-600'
                    : 'text-accent-ink'
                }`}
              >
                {player.totalPoints}
              </p>
              <p className="text-xs text-ink-3">puntos</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);
