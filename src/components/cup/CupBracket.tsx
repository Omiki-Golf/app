import React, { useMemo, useState } from 'react';
import { cupMatchName, cupRoundCount, cupRoundName, cupSeries, isCupBye, type CupEntrant, type CupGame, type CupMatch } from '../../services/cupService';

/** Fila de un jugador dentro de la caja del cruce. */
function EntrantLine({ entrant, wins, bestOf, winner, loser, seed }: {
  entrant: CupEntrant | null;
  wins: number;
  bestOf: 1 | 3;
  winner: boolean;
  loser: boolean;
  seed?: number;
}) {
  return (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 text-sm ${winner ? 'font-bold text-ink' : loser ? 'text-ink-3 line-through decoration-1' : 'text-ink-2'}`}>
      {seed !== undefined && <span className="w-4 shrink-0 text-right text-[10px] text-ink-3 tabular-nums">{seed}</span>}
      <span className="min-w-0 flex-1 truncate">{entrant ? entrant.name : <span className="italic text-ink-3">Por decidir</span>}</span>
      {entrant && <span className="shrink-0 text-[10px] text-ink-3 tabular-nums">PJ {Number(entrant.playing_handicap)}</span>}
      {entrant && bestOf === 3 && (
        <span className="shrink-0 text-xs tracking-tight text-amber-500" aria-label={`${wins} victorias`}>
          {wins >= 1 ? '●' : '○'}{wins >= 2 ? '●' : '○'}
        </span>
      )}
      {entrant && bestOf === 1 && winner && <span className="shrink-0 text-xs text-amber-500" aria-hidden="true">●</span>}
    </div>
  );
}

export function CupMatchBox({ match, entrants, games, seeds, highlight, onSelect }: {
  match: CupMatch;
  entrants: Map<string, CupEntrant>;
  games: readonly CupGame[];
  seeds?: Map<string, number>;
  highlight?: string | null;
  onSelect?: (match: CupMatch) => void;
}) {
  const [winsA, winsB] = cupSeries(match, games);
  const a = match.entrant_a ? entrants.get(match.entrant_a) ?? null : null;
  const b = match.entrant_b ? entrants.get(match.entrant_b) ?? null : null;
  const bye = isCupBye(match);
  const decided = Boolean(match.winner_entrant);
  const mine = Boolean(highlight && (match.entrant_a === highlight || match.entrant_b === highlight));
  const content = (
    <>
      <EntrantLine entrant={a} wins={winsA} bestOf={match.best_of} winner={decided && match.winner_entrant === match.entrant_a}
        loser={decided && !bye && match.winner_entrant !== match.entrant_a} seed={match.entrant_a ? seeds?.get(match.entrant_a) : undefined} />
      <div className="border-t border-line" />
      {bye && !b ? (
        <p className="px-2.5 py-1.5 text-xs italic text-ink-3">Pase directo</p>
      ) : (
        <EntrantLine entrant={b} wins={winsB} bestOf={match.best_of} winner={decided && match.winner_entrant === match.entrant_b}
          loser={decided && !bye && match.winner_entrant !== match.entrant_b} seed={match.entrant_b ? seeds?.get(match.entrant_b) : undefined} />
      )}
      {match.awarded_entrant && <p className="border-t border-line px-2.5 py-1 text-[10px] text-ink-3">Adjudicado{match.award_note ? ` · ${match.award_note}` : ''}</p>}
    </>
  );
  const className = `w-full overflow-hidden rounded-xl border-2 bg-card text-left shadow-soft transition-colors ${
    mine ? 'border-amber-400' : decided ? 'border-accent-ring' : 'border-line'}`;
  return onSelect
    ? <button type="button" onClick={() => onSelect(match)} className={`${className} hover:bg-card-2`}>{content}</button>
    : <div className={className}>{content}</div>;
}

/**
 * Árbol de llaves. En escritorio, columnas por ronda con desplazamiento horizontal;
 * en móvil, selector de ronda y tarjetas a todo el ancho.
 */
export function CupBracket({ matches, entrants, games, highlight, onSelect }: {
  matches: readonly CupMatch[];
  entrants: readonly CupEntrant[];
  games: readonly CupGame[];
  highlight?: string | null;
  onSelect?: (match: CupMatch) => void;
}) {
  const total = cupRoundCount(matches);
  const byId = useMemo(() => new Map(entrants.map(entrant => [entrant.id, entrant])), [entrants]);
  const seeds = useMemo(() => {
    const ranked = [...entrants].filter(entrant => entrant.rank !== null).sort((x, y) => (x.rank ?? 0) - (y.rank ?? 0));
    return new Map(ranked.map((entrant, index) => [entrant.id, index + 1]));
  }, [entrants]);
  const firstOpen = matches.filter(match => match.code !== 'third-place' && !match.winner_entrant)
    .reduce((min, match) => Math.min(min, match.round_index), total - 1);
  const [round, setRound] = useState(Math.max(0, firstOpen));
  const third = matches.find(match => match.code === 'third-place');
  const rounds = Array.from({ length: total }, (_, index) => ({
    index,
    name: cupRoundName(index, total),
    matches: matches.filter(match => match.code !== 'third-place' && match.round_index === index).sort((x, y) => x.position - y.position),
  }));

  if (total === 0) return <p className="text-sm text-ink-3">El cuadro aparecerá al publicarlo.</p>;

  return (
    <div className="space-y-3">
      {/* Móvil: selector de ronda. */}
      <div className="flex flex-wrap gap-1.5 md:hidden" role="tablist" aria-label="Rondas">
        {rounds.map(item => (
          <button key={item.index} type="button" role="tab" aria-selected={round === item.index} onClick={() => setRound(item.index)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${round === item.index ? 'border-amber-500 bg-amber-400 text-slate-950' : 'border-line bg-card text-ink-2'}`}>
            {item.name}
          </button>
        ))}
      </div>
      <div className="space-y-2 md:hidden">
        {rounds[round]?.matches.map(match => (
          <CupMatchBox key={match.id} match={match} entrants={byId} games={games} seeds={seeds} highlight={highlight} onSelect={onSelect} />
        ))}
        {round === total - 1 && third && (
          <div className="pt-2">
            <p className="mb-1 text-xs font-semibold text-ink-3">{cupMatchName(third, total)}</p>
            <CupMatchBox match={third} entrants={byId} games={games} seeds={seeds} highlight={highlight} onSelect={onSelect} />
          </div>
        )}
      </div>

      {/* Escritorio: árbol completo. */}
      <div className="hidden overflow-x-auto pb-2 md:block" style={{ scrollBehavior: 'smooth' }}>
        <div className="flex min-w-max gap-4">
          {rounds.map(item => (
            <div key={item.index} className="flex w-56 flex-col">
              <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-ink-3">{item.name}</p>
              <div className="flex flex-1 flex-col justify-around gap-3">
                {item.matches.map(match => (
                  <div key={match.id} className="relative">
                    <CupMatchBox match={match} entrants={byId} games={games} seeds={seeds} highlight={highlight} onSelect={onSelect} />
                    {match.next_code && (
                      <span aria-hidden="true" className={`absolute -right-4 top-1/2 h-0.5 w-4 ${match.winner_entrant ? 'bg-amber-400' : 'bg-line'}`} />
                    )}
                  </div>
                ))}
                {item.index === total - 1 && third && (
                  <div className="mt-6">
                    <p className="mb-1 text-center text-[11px] font-semibold text-ink-3">{cupMatchName(third, total)}</p>
                    <CupMatchBox match={third} entrants={byId} games={games} seeds={seeds} highlight={highlight} onSelect={onSelect} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
