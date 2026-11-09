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
  const resultLeaders = entries.map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => value(entry) === target);

  // En los premios de una partida rápida, compartir resultado no basta para
  // compartir premio: el hándicap desempata. Solo se muestran varios nombres
  // cuando también empatan en el hándicap que resulte ganador.
  const awardLeaders = handicap && resultLeaders.length > 0
    ? (() => {
        const handicaps = resultLeaders.map(({ entry }) => handicap(entry));
        const targetHandicap = handicapOrder === 'lower'
          ? Math.min(...handicaps)
          : Math.max(...handicaps);
        return resultLeaders.filter(({ entry }) => handicap(entry) === targetHandicap);
      })()
    : resultLeaders;

  return awardLeaders
    .sort((a, b) => handicap
      ? (handicapOrder === 'lower' ? handicap(a.entry) - handicap(b.entry) : handicap(b.entry) - handicap(a.entry)) || a.index - b.index
      : a.index - b.index)
    .map(({ entry }) => entry);
}
