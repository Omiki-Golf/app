// Completed rounds remain correctable by their creator until they are archived.
export function canEditRoundScores(isCreator: boolean, status: string): boolean {
  return isCreator && (status === 'active' || status === 'completed');
}
