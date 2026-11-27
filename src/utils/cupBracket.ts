import type { CupTie } from './cupResults';

export interface CupEntrant {
  id: string;
  playingHandicap: number;
  rank?: number;
}

interface CupDraw {
  capacity: 20 | 32;
  method: 'random' | 'ranking' | 'handicap' | 'manual';
  bestOf: 1 | 3;
  finalBestOf?: 1 | 3;
  thirdPlace?: boolean;
  manualSlots?: readonly (string | null)[];
}

export function generateCupBracket(entrants: readonly CupEntrant[], draw: CupDraw): CupTie[] {
  const ids = new Set(entrants.map(player => player.id));
  if (entrants.length < 4 || entrants.length > draw.capacity ||
    ids.size !== entrants.length || ids.has('')) {
    throw new Error('La lista de participantes de Copa no es válida.');
  }

  const size = 2 ** Math.ceil(Math.log2(entrants.length));
  const byes = size - entrants.length;
  const slots = draw.method === 'manual'
    ? [...(draw.manualSlots ?? [])]
    : automaticSlots(entrants, draw.method, byes, size);

  const assigned = slots.filter(id => id !== null);
  if (slots.length !== size || assigned.length !== ids.size ||
    new Set(assigned).size !== ids.size || assigned.some(id => !ids.has(id)) ||
    slots.some((id, index) => index % 2 === 0 && id === null && slots[index + 1] === null)) {
    throw new Error('Cada jugador debe ocupar una sola plaza y cada cruce debe tener un jugador.');
  }

  const bracket: CupTie[] = [];
  for (let round = 0, count = size / 2; count >= 1; round++, count /= 2) {
    const firstTie = bracket.length;
    for (let index = 0; index < count; index++) {
      const slot = index % 2 === 0 ? 0 : 1;
      const next = count === 1 ? undefined : { id: `${round + 1}-${Math.floor(index / 2)}`, slot } as const;
      const players: CupTie['players'] = round === 0
        ? [slots[index * 2], slots[index * 2 + 1]]
        : [null, null];
      bracket.push({
        id: `${round}-${index}`, players, next, started: false, results: [],
        bestOf: count === 1 ? draw.finalBestOf ?? draw.bestOf : draw.bestOf,
      });
    }
    if (round === 1) {
      for (let index = 0; index < count * 2; index++) {
        const [first, second] = bracket[index].players;
        if (first && second) continue;
        bracket[firstTie + Math.floor(index / 2)].players[index % 2] = first ?? second;
      }
    }
  }
  if (draw.thirdPlace) {
    const semifinalists = bracket.slice(-3, -1);
    semifinalists.forEach((tie, index) => {
      tie.thirdPlace = { id: 'third-place', slot: index === 0 ? 0 : 1 };
    });
    bracket.push({
      id: 'third-place', players: [null, null], started: false, results: [], bestOf: draw.bestOf,
    });
  }
  return bracket;
}

function automaticSlots(
  entrants: readonly CupEntrant[],
  method: Exclude<CupDraw['method'], 'manual'>,
  byes: number,
  size: number,
): (string | null)[] {
  const ordered = [...entrants];
  if (method === 'random') {
    for (let index = ordered.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [ordered[index], ordered[other]] = [ordered[other], ordered[index]];
    }
  } else if (method === 'ranking') {
    ordered.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  } else {
    ordered.sort((a, b) => a.playingHandicap - b.playingHandicap);
  }

  // Standard seed placement keeps the first two seeds in opposite halves.
  let seeds = [1, 2];
  while (seeds.length < size) {
    const sum = seeds.length * 2 + 1;
    seeds = seeds.flatMap(seed => [seed, sum - seed]);
  }
  const slots = seeds.map(seed => ordered[seed - 1]?.id ?? null);
  if (method === 'ranking' && ordered.filter(player => player.rank === undefined).length === 2) {
    const first = slots.indexOf(ordered[ordered.length - 2].id);
    const second = slots.indexOf(ordered[ordered.length - 1].id);
    if (size / 2 > byes && slots[first ^ 1] !== null && slots[second ^ 1] !== null) {
      [slots[first ^ 1], slots[second]] = [slots[second], slots[first ^ 1]];
    }
  }
  return slots;
}
