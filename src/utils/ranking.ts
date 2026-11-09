export type HandicapOrder = 'lower' | 'higher';

/** Orden estable: el índice original solo decide el orden visual cuando resultado y HCP empatan. */
export function sortByResultAndHandicap<T>(
  entries: readonly T[],
  result: (entry: T) => number,
  handicap: (entry: T) => number,
  resultOrder: 'higher' | 'lower' = 'higher',
  handicapOrder: HandicapOrder = 'lower',
): T[] {
  return entries.map((entry, index) => ({ entry, index })).sort((a, b) => {
    const resultDifference = resultOrder === 'higher' ? result(b.entry) - result(a.entry) : result(a.entry) - result(b.entry);
    if (resultDifference) return resultDifference;
    const handicapDifference = handicapOrder === 'lower' ? handicap(a.entry) - handicap(b.entry) : handicap(b.entry) - handicap(a.entry);
    return handicapDifference || a.index - b.index;
  }).map(item => item.entry);
}

/** Puesto de competición: 1, 2, 3, 3… cuando resultado y HCP son idénticos. */
export function competitionPosition<T>(sortedEntries: readonly T[], index: number, sameResultAndHandicap: (left: T, right: T) => boolean): number {
  let firstEqual = index;
  while (firstEqual > 0 && sameResultAndHandicap(sortedEntries[firstEqual - 1], sortedEntries[index])) firstEqual--;
  return firstEqual + 1;
}
