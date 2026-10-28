// Completed rounds remain correctable by their creator until they are archived.
// Whoever holds the round's access code can enter scores while it is active.
export function canEditRoundScores(isCreator: boolean, status: string, hasAccessCode = false): boolean {
  return (isCreator && (status === 'active' || status === 'completed')) || (hasAccessCode && status === 'active');
}
