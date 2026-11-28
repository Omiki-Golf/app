import React, { useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Shuffle, Trash2, UserPlus, X } from 'lucide-react';
import { WriteButton } from '../../context/ReadOnlyContext';
import { SelectMenu } from '../SelectMenu';
import { golfService } from '../../services/golfService';
import { cupDrawLabel, cupService, type CupDrawMethod, type CupEntrant, type CupView } from '../../services/cupService';
import { generateCupBracket } from '../../utils/cupBracket';
import { getErrorMessage } from '../../utils/errorMessage';
import type { Player } from '../../types';

const input = 'w-full rounded-lg border-2 border-line-2 bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none';
const primary = 'rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60';
const secondary = 'rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink-2 transition-colors hover:bg-card-2 disabled:opacity-60';
const parsePj = (value: string) => Number(value.trim().replace(',', '.'));
const validPj = (value: number) => Number.isFinite(value) && value >= 0 && value <= 54;
const normalizeName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es');

function useAction(onChanged: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setBusy(true); setError('');
    try { await action(); await onChanged(); return true; }
    catch (cause) { setError(getErrorMessage(cause, fallback)); return false; }
    finally { setBusy(false); }
  };
  return { busy, error, setError, run };
}

/** Invitados sin cuenta frente a registrados: un cuadro no puede tener más de los primeros. */
function GuestBalance({ entrants }: { entrants: readonly CupEntrant[] }) {
  const guests = entrants.filter(entrant => !entrant.has_account).length;
  const registered = entrants.length - guests;
  if (guests === 0) return null;
  const over = guests > registered;
  return (
    <p className={`rounded-lg px-3 py-2 text-xs ${over ? 'border border-red-300 bg-red-50 font-semibold text-red-700' : 'bg-card-2 text-ink-3'}`}>
      Invitados sin cuenta: {guests} · Registrados: {registered}.{' '}
      {over ? 'Añade jugadores registrados o quita invitados: no puede haber más invitados que registrados.'
        : 'Cada cruce de primera ronda tendrá al menos un jugador registrado.'}
    </p>
  );
}

/** Jugadores de la edición: todos los ven; el creador y los administradores los editan antes de publicar. */
export function CupPlayers({ view, onChanged }: { view: CupView; onChanged: () => Promise<void> }) {
  const { edition, entrants, capacity } = view;
  const editable = view.can_manage && ['draft', 'registration', 'draw_ready'].includes(edition.status);
  const { busy, error, run } = useAction(onChanged);
  const [roster, setRoster] = useState<Player[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editPj, setEditPj] = useState('');
  const [query, setQuery] = useState('');
  const [guestPj, setGuestPj] = useState('');

  useEffect(() => {
    if (!editable) return;
    let cancelled = false;
    golfService.getAllPlayers(edition.group_id).then(players => { if (!cancelled) setRoster(players); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [editable, edition.group_id]);

  const inCup = new Set(entrants.map(entrant => entrant.player_id).filter(Boolean));
  const available = roster.filter(player => !inCup.has(player.id));
  const full = entrants.length >= capacity;
  const registrationLabel = (entrant: CupEntrant) => entrant.registration === 'pending' ? 'Pendiente de confirmar'
    : entrant.registration === 'declined' ? 'No participa' : null;

  // Sugerencias mientras se escribe: solo jugadores del grupo que tiene la Copa y aún no inscritos.
  const typed = normalizeName(query);
  const suggestions = typed ? available.filter(player => normalizeName(player.name).includes(typed)).slice(0, 6) : [];
  const exactMatch = Boolean(typed) && (available.some(player => normalizeName(player.name) === typed)
    || entrants.some(entrant => normalizeName(entrant.name) === typed));

  return (
    <section aria-labelledby="cup-players" className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 id="cup-players" className="text-lg font-bold text-ink">Jugadores</h2>
        <span className="text-xs text-ink-3">{entrants.length} de {capacity} · mínimo 4</span>
      </div>
      {editable && <p className="text-xs text-ink-3">Los cambios solo valen para esta Copa: no tocan la plantilla ni los PJ del grupo.</p>}
      <ul className="divide-y divide-line rounded-2xl border border-line bg-card shadow-card">
        {entrants.map(entrant => (
          <li key={entrant.id} className="flex items-center gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{entrant.name}</p>
              <p className="text-xs text-ink-3">
                {entrant.has_account ? (entrant.is_guest ? 'Invitado con cuenta' : 'Miembro') : entrant.player_id ? 'Jugador del grupo sin cuenta' : 'Invitado sin cuenta'}
                {entrant.rank !== null ? ` · Ranking ${entrant.rank}` : view.current_ranks[entrant.id] ? ` · Ranking ${view.current_ranks[entrant.id]}` : ''}
                {registrationLabel(entrant) ? ` · ${registrationLabel(entrant)}` : ''}
              </p>
            </div>
            {editing === entrant.id ? (
              <>
                <input aria-label={`PJ de ${entrant.name}`} inputMode="decimal" value={editPj} onChange={event => setEditPj(event.target.value)} className="w-16 rounded-lg border-2 border-line-2 bg-card px-2 py-1 text-center text-sm" />
                <button type="button" aria-label="Guardar PJ" disabled={busy || !validPj(parsePj(editPj))}
                  onClick={() => void run(() => cupService.updateEntrant(entrant.id, null, parsePj(editPj)), 'No se ha podido guardar el PJ.').then(ok => ok && setEditing(null))}
                  className="rounded-lg p-1.5 text-accent-ink disabled:opacity-50"><Check size={18} /></button>
                <button type="button" aria-label="Cancelar" onClick={() => setEditing(null)} className="rounded-lg p-1.5 text-ink-3"><X size={18} /></button>
              </>
            ) : (
              <>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">PJ {Number(entrant.playing_handicap)}</span>
                {editable && <>
                  <button type="button" aria-label={`Editar PJ de ${entrant.name}`} onClick={() => { setEditing(entrant.id); setEditPj(String(Number(entrant.playing_handicap))); }} className="rounded-lg p-1.5 text-ink-3 hover:text-ink"><Pencil size={16} /></button>
                  <WriteButton type="button" aria-label={`Quitar a ${entrant.name}`} disabled={busy} onClick={() => void run(() => cupService.removeEntrant(entrant.id), 'No se ha podido quitar al jugador.')} className="rounded-lg p-1.5 text-red-500"><Trash2 size={16} /></WriteButton>
                </>}
              </>
            )}
          </li>
        ))}
        {entrants.length === 0 && <li className="px-3 py-3 text-sm text-ink-3">Todavía no hay jugadores.</li>}
      </ul>

      {editable && !full && (
        <div className="space-y-3 rounded-2xl border border-line bg-card p-3 shadow-card">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink"><UserPlus size={16} /> Añadir jugadores</p>
          <div className="relative space-y-2">
            <input aria-label="Nombre del jugador" value={query} autoComplete="off" placeholder="Escribe un nombre del grupo"
              onChange={event => setQuery(event.target.value)} className={input} />
            {suggestions.length > 0 && (
              <ul role="listbox" aria-label="Jugadores del grupo" className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card-2">
                {suggestions.map(player => (
                  <li key={player.id}>
                    <WriteButton type="button" disabled={busy} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-card"
                      onClick={() => void run(() => cupService.addEntrant(edition.id, { playerId: player.id, handicap: Math.min(54, Number(player.exact_handicap) * 2) }), 'No se ha podido añadir al jugador.')
                        .then(ok => ok && setQuery(''))}>
                      <span className="min-w-0 truncate font-semibold text-ink">{player.name}{player.is_guest ? ' · Invitado del grupo' : ''}</span>
                      <span className="shrink-0 text-xs text-ink-3">PJ {Number(player.exact_handicap) * 2}</span>
                    </WriteButton>
                  </li>
                ))}
              </ul>
            )}
            {query.trim().length >= 2 && suggestions.length === 0 && (
              <p className="text-xs text-ink-3">Nadie del grupo coincide{available.length === 0 ? ' (ya están todos inscritos)' : ''}.</p>
            )}
            {query.trim().length >= 2 && !exactMatch && (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-line p-2">
                <span className="min-w-0 flex-1 truncate text-xs text-ink-2">Añadir «{query.trim()}» como invitado sin cuenta</span>
                <input aria-label="PJ del invitado" value={guestPj} onChange={event => setGuestPj(event.target.value)} inputMode="decimal" placeholder="PJ" className="w-16 rounded-lg border-2 border-line-2 bg-card px-2 py-1.5 text-center text-sm" />
                <WriteButton type="button" disabled={busy || !validPj(parsePj(guestPj))} className={secondary}
                  onClick={() => void run(() => cupService.addEntrant(edition.id, { name: query.trim(), handicap: parsePj(guestPj) }), 'No se ha podido añadir al invitado.')
                    .then(ok => { if (ok) { setQuery(''); setGuestPj(''); } })}>Añadir</WriteButton>
              </div>
            )}
          </div>
        </div>
      )}
      {editable && <GuestBalance entrants={entrants.filter(entrant => entrant.registration !== 'declined')} />}
      {editable && full && <p className="text-xs text-ink-3">Has llegado al máximo de {capacity} jugadores{capacity === 20 ? ' (con Ampliación de Plantilla pasas a 32)' : ''}.</p>}
      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
    </section>
  );
}

/** Configuración del Match (gestores) o resumen informativo (resto). */
export function CupSettings({ view, onChanged }: { view: CupView; onChanged: () => Promise<void> }) {
  const { edition } = view;
  const pre = ['draft', 'registration', 'draw_ready'].includes(edition.status);
  const { busy, error, run } = useAction(onChanged);
  const [name, setName] = useState(edition.name);
  const [days, setDays] = useState(edition.round_days ? String(edition.round_days) : '');
  const [deadline, setDeadline] = useState('');
  useEffect(() => { setName(edition.name); setDays(edition.round_days ? String(edition.round_days) : ''); }, [edition.name, edition.round_days]);

  if (!view.can_manage) {
    return (
      <section aria-labelledby="cup-settings" className="space-y-2 rounded-2xl border border-line bg-card p-4 shadow-card">
        <h2 id="cup-settings" className="text-lg font-bold text-ink">Formato</h2>
        <ul className="space-y-1 text-sm text-ink-2">
          <li>Emparejamiento: {edition.draw_method ? cupDrawLabel[edition.draw_method] : 'por decidir'}</li>
          <li>Eliminatorias: {edition.best_of === 3 ? 'al mejor de 3' : 'a un partido'}; final {edition.final_best_of === 3 ? 'al mejor de 3' : 'a un partido'}</li>
          <li>Tercer puesto: {edition.third_place ? 'sí' : 'no (los semifinalistas constan como semifinalistas)'}</li>
          <li>Plazo por ronda: {edition.round_days ? `${edition.round_days} días` : 'sin plazo'}</li>
        </ul>
      </section>
    );
  }

  const save = (settings: Parameters<typeof cupService.updateSettings>[1]) =>
    run(() => cupService.updateSettings(edition.id, settings), 'No se ha podido guardar la configuración.');
  const choice = (active: boolean) => `rounded-xl border-2 px-3 py-2 text-sm font-semibold ${active ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-card text-ink-2'}`;

  return (
    <section aria-labelledby="cup-settings" className="space-y-4 rounded-2xl border border-line bg-card p-4 shadow-card">
      <h2 id="cup-settings" className="text-lg font-bold text-ink">Configuración del Match</h2>
      <div className="flex gap-2">
        <input aria-label="Nombre de la edición" value={name} onChange={event => setName(event.target.value)} className={input} maxLength={80} />
        <WriteButton type="button" disabled={busy || !name.trim() || name.trim() === edition.name} className={secondary} onClick={() => void save({ name: name.trim() })}>Guardar</WriteButton>
      </div>
      {pre && <>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-ink">Modalidad de emparejamiento</legend>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(cupDrawLabel) as CupDrawMethod[]).map(method => (
              <WriteButton key={method} type="button" aria-pressed={edition.draw_method === method} disabled={busy} className={choice(edition.draw_method === method)}
                onClick={() => void save({ draw_method: method })}>{cupDrawLabel[method]}</WriteButton>
            ))}
          </div>
          <p className="text-xs text-ink-3">Los pases directos siguen la modalidad: por sorteo, a los cabezas de serie, a los PJ más bajos o a mano.</p>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-ink">Formato</legend>
          <div className="grid grid-cols-2 gap-2">
            <WriteButton type="button" aria-pressed={edition.best_of === 1} disabled={busy} className={choice(edition.best_of === 1)} onClick={() => void save({ best_of: 1 })}>Mejor de 1 (Bo1)</WriteButton>
            <WriteButton type="button" aria-pressed={edition.best_of === 3} disabled={busy} className={choice(edition.best_of === 3)} onClick={() => void save({ best_of: 3, final_best_of: 3 })}>Mejor de 3 (Bo3)</WriteButton>
          </div>
          {edition.best_of === 1 && (
            <label className="flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" checked={edition.final_best_of === 3} disabled={busy} onChange={event => void save({ final_best_of: event.target.checked ? 3 : 1 })} className="h-4 w-4 accent-[var(--accent)]" />
              Gran final al mejor de 3
            </label>
          )}
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={edition.third_place} disabled={busy} onChange={event => void save({ third_place: event.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
            Partido por el 3.er y 4.º puesto
          </label>
        </fieldset>
      </>}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-ink">Plazo por ronda (opcional)</p>
        <div className="flex items-center gap-2">
          <input aria-label="Días por ronda" inputMode="numeric" value={days} onChange={event => setDays(event.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="14" className="w-20 rounded-lg border-2 border-line-2 bg-card px-2 py-2 text-center text-sm" />
          <span className="text-sm text-ink-3">días</span>
          <WriteButton type="button" disabled={busy || (days !== '' && (Number(days) < 1 || Number(days) > 90)) || (days === '' ? edition.round_days === null : Number(days) === edition.round_days)}
            className={secondary} onClick={() => void save({ round_days: days === '' ? null : Number(days) })}>Guardar</WriteButton>
        </div>
        <p className="text-xs text-ink-3">El plazo empieza cuando el cruce tiene sus dos jugadores. Cada fecha se puede cambiar después en Enfrentamientos.</p>
      </div>
      {edition.status === 'draft' && (
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-sm font-semibold text-ink">Inscripciones (opcional)</p>
          <p className="text-xs text-ink-3">Los jugadores con cuenta reciben un mensaje y confirman si juegan. Quien no confirme queda fuera del cuadro. Si no abres inscripciones, juegan todos los de la lista.</p>
          <label htmlFor="cup-registration-deadline" className="block text-xs font-semibold text-ink-2">Fecha límite para confirmar (opcional)</label>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <input id="cup-registration-deadline" type="date" value={deadline} min={new Date().toISOString().slice(0, 10)}
                onChange={event => setDeadline(event.target.value)} className={`${input} ${deadline ? 'pr-9' : 'text-transparent'}`} />
              {/* El selector de fecha del móvil no muestra texto de ayuda: lo ponemos encima mientras está vacío. */}
              {!deadline && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-ink-3">Sin fecha límite</span>}
              {deadline && (
                <button type="button" onClick={() => setDeadline('')} aria-label="Quitar la fecha límite"
                  className="absolute inset-y-0 right-2 flex items-center text-ink-3 hover:text-ink"><X size={16} aria-hidden="true" /></button>
              )}
            </div>
            <WriteButton type="button" disabled={busy} className={`${secondary} shrink-0 whitespace-nowrap`}
              onClick={() => void run(() => cupService.openRegistration(edition.id, deadline ? new Date(`${deadline}T23:59:59`).toISOString() : null), 'No se han podido abrir las inscripciones.')}>Abrir inscripciones</WriteButton>
          </div>
          <p className="text-xs text-ink-3">
            {deadline ? `Podrán confirmar hasta el ${new Date(`${deadline}T12:00:00`).toLocaleDateString('es-ES')}.` : 'Sin fecha, pueden confirmar hasta que publiques el cuadro.'}
          </p>
        </div>
      )}
      {edition.status === 'registration' && (
        <div className="flex items-center justify-between gap-2 border-t border-line pt-3 text-sm">
          <span className="text-ink-2">Inscripciones abiertas{edition.registration_deadline ? ` hasta el ${new Date(edition.registration_deadline).toLocaleDateString('es-ES')}` : ''}.</span>
          <WriteButton type="button" disabled={busy} className="text-xs font-semibold text-ink-3 underline" onClick={() => void run(() => cupService.setStatus(edition.id, 'draft'), 'No se han podido cerrar.')}>Cancelar inscripciones</WriteButton>
        </div>
      )}
      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
    </section>
  );
}

/** Generar, revisar, rehacer y publicar el cuadro. */
export function CupDraw({ view, onChanged }: { view: CupView; onChanged: () => Promise<void> }) {
  const { edition, entrants } = view;
  const { busy, error, setError, run } = useAction(onChanged);
  const pool = useMemo(() => entrants.filter(entrant => entrant.registration === 'confirmed'), [entrants]);
  const size = pool.length >= 2 ? 2 ** Math.ceil(Math.log2(pool.length)) : 0;
  const [manual, setManual] = useState<(string | null)[]>([]);
  useEffect(() => {
    if (edition.draw_method !== 'manual') return;
    setManual(current => current.length === size ? current : Array.from({ length: size }, (_, index) => {
      // Reparto inicial: un jugador por cruce y los pases directos al final de cada pareja.
      const pairs = size / 2;
      const pair = index >> 1;
      const player = index % 2 === 0 ? pool[pair] : pool[pairs + pair];
      return player?.id ?? null;
    }));
  }, [edition.draw_method, size, pool]);

  if (!view.can_manage) return null;
  const byId = new Map(entrants.map(entrant => [entrant.id, entrant]));
  const guestCount = pool.filter(entrant => !entrant.has_account).length;
  const tooManyGuests = guestCount > pool.length - guestCount;
  const isGuest = (id: string | null | undefined) => Boolean(id && byId.get(id) && !byId.get(id)!.has_account);

  const generate = () => {
    if (!edition.draw_method) { setError('Elige la modalidad de emparejamiento antes de generar el cuadro.'); return; }
    try {
      const bracket = generateCupBracket(
        pool.map(entrant => ({ id: entrant.id, playingHandicap: Number(entrant.playing_handicap), rank: view.current_ranks[entrant.id] ?? undefined, guest: !entrant.has_account })),
        { capacity: view.capacity, method: edition.draw_method, bestOf: edition.best_of, finalBestOf: edition.final_best_of, thirdPlace: edition.third_place, manualSlots: manual });
      const slots = bracket.slice(0, size / 2).flatMap(tie => tie.players);
      void run(() => cupService.saveDraw(edition.id, edition.draw_method!, slots), 'No se ha podido guardar el sorteo.');
    } catch (cause) {
      setError(getErrorMessage(cause, 'El cuadro no es válido.'));
    }
  };

  const slots = edition.draw_slots;
  return (
    <section aria-labelledby="cup-draw" className="space-y-3 rounded-2xl border border-line bg-card p-4 shadow-card">
      <h2 id="cup-draw" className="text-lg font-bold text-ink">Cuadro de competición</h2>
      {pool.length < 4 && <p className="text-sm text-ink-3">Hacen falta al menos 4 jugadores confirmados.</p>}
      <GuestBalance entrants={pool} />
      {edition.draw_method === 'manual' && edition.status !== 'draw_ready' && pool.length >= 4 && (
        <div className="space-y-2">
          <p className="text-xs text-ink-3">Coloca a cada jugador una vez. Un hueco vacío es un pase directo para su pareja.</p>
          {Array.from({ length: size / 2 }, (_, pair) => (
            <div key={pair} className={`space-y-1.5 rounded-xl border bg-card-2 p-2.5 ${isGuest(manual[pair * 2]) && isGuest(manual[pair * 2 + 1]) ? 'border-red-400' : 'border-line'}`}>
              <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Cruce {pair + 1}
                {isGuest(manual[pair * 2]) && isGuest(manual[pair * 2 + 1]) && <span className="ml-1 normal-case tracking-normal text-red-600">· dos invitados sin cuenta</span>}</p>
              <div className="grid gap-1.5 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                {[0, 1].map(side => {
                  const slot = pair * 2 + side;
                  return (
                    <React.Fragment key={side}>
                      {side === 1 && <span className="text-center text-xs font-semibold text-ink-3">vs</span>}
                      <SelectMenu ariaLabel={`Cruce ${pair + 1}, plaza ${side + 1}`} value={manual[slot] ?? ''}
                        onChange={value => setManual(current => current.map((item, index) => index === slot ? (value || null) : item))}
                        options={[
                          { value: '', label: <span className="italic text-ink-3">Pase directo</span> },
                          ...pool.map(entrant => {
                            // Indica si el jugador ya está colocado en otro hueco para no repetirlo.
                            const placed = manual.findIndex((id, index) => id === entrant.id && index !== slot);
                            return {
                              value: entrant.id,
                              label: <span className="flex items-center justify-between gap-2"><span className="truncate">{entrant.name}</span>
                                {placed >= 0 && <span className="shrink-0 text-xs font-normal text-ink-3">en cruce {(placed >> 1) + 1}</span>}</span>,
                            };
                          }),
                        ]} />
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {edition.status === 'draw_ready' && slots ? (
        <>
          <p className="text-xs text-ink-3">{edition.draw_method ? cupDrawLabel[edition.draw_method] : ''} · Revisa los cruces de la primera ronda. Al publicar se fijan el ranking y los PJ.</p>
          <ol className="space-y-1.5">
            {Array.from({ length: slots.length / 2 }, (_, pair) => {
              const a = slots[pair * 2] ? byId.get(slots[pair * 2]!) : null;
              const b = slots[pair * 2 + 1] ? byId.get(slots[pair * 2 + 1]!) : null;
              return <li key={pair} className="flex items-center gap-2 rounded-lg bg-card-2 px-3 py-2 text-sm">
                <span className="w-5 text-xs text-ink-3">{pair + 1}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-ink">{a?.name ?? 'Pase directo'}</span>
                <span className="text-xs text-ink-3">vs</span>
                <span className="min-w-0 flex-1 truncate text-right font-semibold text-ink">{b?.name ?? 'Pase directo'}</span>
              </li>;
            })}
          </ol>
          <div className="grid grid-cols-2 gap-2">
            <WriteButton type="button" disabled={busy} className={secondary} onClick={() => void run(() => cupService.discardDraw(edition.id), 'No se ha podido rehacer el cuadro.')}>
              <Shuffle size={16} className="mr-1 inline" aria-hidden="true" />Rehacer
            </WriteButton>
            <WriteButton type="button" disabled={busy} className={primary} onClick={() => void run(() => cupService.publishDraw(edition.id), 'No se ha podido publicar el cuadro.')}>Publicar cuadro</WriteButton>
          </div>
        </>
      ) : (
        <WriteButton type="button" disabled={busy || pool.length < 4 || !edition.draw_method || tooManyGuests} className={`${primary} w-full`} onClick={generate}>
          Generar cuadro de competición
        </WriteButton>
      )}
      {!edition.draw_method && <p className="text-xs text-ink-3">Elige antes la modalidad de emparejamiento en la configuración.</p>}
      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
    </section>
  );
}
