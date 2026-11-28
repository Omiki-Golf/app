type ResumeScore = { player_id: string; hole_number: number; gross_strokes: number | null; abandoned?: boolean | null };

/**
 * Hoyo (posición 1..n en `holes`) en el que retomar una partida al reabrirla:
 * el primero al que le falta algún resultado; si están todos, el último.
 */
export function resumeHoleIndex(
  holes: { hole_number: number }[],
  players: { id: string }[],
  scores: ResumeScore[],
): number {
  if (!holes.length || !players.length) return 1;
  const entered = new Set(scores
    .filter(score => score.abandoned || (score.gross_strokes ?? 0) > 0)
    .map(score => `${score.player_id}:${score.hole_number}`));
  const pending = holes.findIndex(hole => players.some(player => !entered.has(`${player.id}:${hole.hole_number}`)));
  return pending === -1 ? holes.length : pending + 1;
}
