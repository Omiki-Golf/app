import React from 'react';
import { X, Trophy, Users, Calendar, MapPin } from 'lucide-react';
import type { ArchivedRound } from '../types';

interface ArchivedRoundsModalProps {
  rounds: ArchivedRound[];
  onClose: () => void;
  onSelectRound: (round: ArchivedRound) => void;
}

export const ArchivedRoundsModal: React.FC<ArchivedRoundsModalProps> = ({
  rounds,
  onClose,
  onSelectRound,
}) => {
  const sortedRounds = [...rounds].sort((a, b) =>
    new Date(b.played_at).getTime() - new Date(a.played_at).getTime()
  );

  const groupedByDate = sortedRounds.reduce((acc, round) => {
    const dateKey = new Date(round.played_at).toISOString().split('T')[0];
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(round);
    return acc;
  }, {} as Record<string, ArchivedRound[]>);

  const sortedDates = Object.keys(groupedByDate).sort((a, b) =>
    new Date(b).getTime() - new Date(a).getTime()
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-lg shadow-card max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-emerald-600 to-emerald-700">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Trophy size={28} />
            Historial de Partidas
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:bg-accent-hover p-2 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="overflow-y-auto p-6">
          {sortedRounds.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-ink-3 text-lg">No hay partidas archivadas</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedDates.map((dateKey) => {
                const dayRounds = groupedByDate[dateKey];
                const date = new Date(dateKey);
                const formattedDate = date.toLocaleDateString('es-ES', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                });

                const allPlayers = new Set<string>();
                dayRounds.forEach((round) => {
                  round.final_ranking?.forEach((player) => {
                    allPlayers.add(player.player_db_id || player.player_name);
                  });
                });

                const courses: string[] = dayRounds.map((r) => String(r.course_name));
                const uniqueCourses: string[] = [...new Set(courses)];

                return (
                  <button
                    key={dateKey}
                    onClick={() => onSelectRound(dayRounds[0])}
                    className="w-full bg-card-2 hover:bg-accent-soft border-2 border-line-2 hover:border-accent rounded-lg p-5 transition-all shadow-soft hover:shadow-lg text-left"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Calendar size={24} className="text-accent-ink" />
                          <div>
                            <p className="text-lg font-bold text-ink capitalize">
                              {formattedDate}
                            </p>
                            <p className="text-sm text-ink-3">
                              {dayRounds.length} {dayRounds.length === 1 ? 'partida' : 'partidas'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-ink-3 mb-1">Total jugadores</p>
                          <div className="flex items-center gap-2 justify-end">
                            <Users size={20} className="text-blue-600" />
                            <p className="text-2xl font-bold text-ink">{allPlayers.size}</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {uniqueCourses.map((course, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-1 bg-card px-3 py-1 rounded-full border border-line"
                          >
                            <MapPin size={14} className="text-accent-ink" />
                            <p className="text-xs font-semibold text-ink-2">{course}</p>
                          </div>
                        ))}
                      </div>

                      <div className="text-sm text-ink-3 bg-card rounded-lg p-2 border border-line">
                        <p className="font-semibold">Haz clic para ver la clasificación completa del día</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-card-2">
          <button
            onClick={onClose}
            className="w-full bg-neutral hover:bg-neutral-hover text-ink font-semibold py-3 rounded-lg transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
