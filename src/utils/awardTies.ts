export function tiedAwardLeaders<T>(
  entries: T[],
  value: (entry: T) => number,
  direction: 'max' | 'min' = 'max',
  handicap?: (entry: T) => number,
  handicapOrder: 'lower' | 'higher' = 'lower',
): T[] {
  if (entries.length === 0) return [];
  const values = entries.map(value);
  const target = direction === 'max' ? Math.max(...values) : Math.min(...values);
  return entries.map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => value(entry) === target)
    .sort((a, b) => handicap
      ? (handicapOrder === 'lower' ? handicap(a.entry) - handicap(b.entry) : handicap(b.entry) - handicap(a.entry)) || a.index - b.index
      : a.index - b.index)
    .map(({ entry }) => entry);
}
