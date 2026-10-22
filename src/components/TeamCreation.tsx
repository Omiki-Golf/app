import { WriteButton } from '../context/ReadOnlyContext';
import { NavigationButton } from './NavigationButton';
import React, { useState, useEffect, useRef } from 'react';
import { Info, Search, UserPlus, Check, X, Users} from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { userService } from '../services/userService';
import { UserProfile } from '../types';

interface TeamCreationProps {
  userId: string;
  onBack: () => void;
  onTeamCreated: (groupId: string) => void;
}

interface TooltipProps {
  text: string;
}

interface PendingPlayer {
  key: string;
  name: string;
  handicap18: number;
  avatarUrl?: string;
  registeredUserId?: string;
}

const Tooltip: React.FC<TooltipProps> = ({ text }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(!show)}
        className="text-ink-4 hover:text-ink-3"
      >
        <Info size={14} />
      </button>
      {show && (
        <div role="tooltip" className="fixed z-[200] left-4 right-4 top-1/2 -translate-y-1/2 bg-ink text-card text-sm p-4 rounded-xl shadow-card sm:absolute sm:left-auto sm:right-0 sm:top-6 sm:w-64 sm:translate-y-0 sm:text-xs sm:p-2.5">
          {text}
        </div>
      )}
    </div>
  );
};

export const TeamCreation: React.FC<TeamCreationProps> = ({ userId, onBack, onTeamCreated }) => {
  const [step, setStep] = useState(1);
  const [groupName, setGroupName] = useState('');
  const [groupCode, setGroupCode] = useState('');
  const [addPlayersNow, setAddPlayersNow] = useState(true);
  const [hoyo19, setHoyo19] = useState(true);
  // Los planes Team y Premium incluyen un grupo: si ya existe, no se ofrece crear otro.
  const [existingGroup, setExistingGroup] = useState<{ id: string; name: string } | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(true);
  const [searchNick, setSearchNick] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<PendingPlayer[]>([]);
  const [guestHandicap18, setGuestHandicap18] = useState('');
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchNick.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await userService.searchByNick(searchNick);
        setSearchResults(results.filter(r => r.user_id !== userId));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchNick]);

  const generateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
  };

  useEffect(() => {
    let active = true;
    supabase
      .from('groups')
      .select('id, name')
      .eq('user_auth_id', userId)
      .is('archived_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .then(({ data }) => {
        if (!active) return;
        setExistingGroup(data?.[0] ?? null);
        setCheckingExisting(false);
      });
    return () => { active = false; };
  }, [userId]);

  const handleCreate = async () => {
    if (!groupName.trim()) { setError('El nombre del grupo es obligatorio'); return; }
    // El grupo ya se creó en este asistente: no se vuelve a insertar.
    if (createdGroupId) { setStep(4); return; }
    const code = groupCode.trim() || generateCode();
    setGroupCode(code);

    setLoading(true);
    setError('');
    try {
      const { data: groupData, error: groupError } = await supabase
        .from('groups')
        .insert({
          name: groupName.trim(),
          group_code: code,
          user_auth_id: userId,
          hoyo_19_enabled: hoyo19,
          max_players: 20,
          group_type: 'team',
        })
        .select()
        .single();

      if (groupError) {
        if (groupError.code === '23505') throw new Error('Ese código de acceso ya lo usa otro grupo. Vuelve al primer paso y elige otro o pulsa Generar.');
        if (groupError.message?.includes('un grupo')) throw new Error(groupError.message);
        throw groupError;
      }
      setCreatedGroupId(groupData.id);


      if (addPlayersNow && selectedPlayers.length > 0) {
        for (const player of selectedPlayers) {
          if (player.registeredUserId) {
            await userService.sendInvitation(groupData.id, player.registeredUserId, userId, `Te han invitado al grupo ${groupName}`);
          } else {
            await userService.addGroupGuest(groupData.id, player.name, player.handicap18);
          }
        }
      }

      setStep(4);
    } catch (err: any) {
      setError(err.message || 'Error al crear el grupo');
    } finally {
      setLoading(false);
    }
  };

  const addPlayer = (player: UserProfile) => {
    if (!selectedPlayers.find(p => p.registeredUserId === player.user_id)) {
      setSelectedPlayers([...selectedPlayers, {
        key: `user:${player.user_id}`,
        name: player.nick,
        handicap18: player.exact_handicap ?? 0,
        avatarUrl: player.avatar_url,
        registeredUserId: player.user_id,
      }]);
    }
    setSearchNick('');
    setSearchResults([]);
    setGuestHandicap18('');
  };

  const addGuest = () => {
    const name = searchNick.trim();
    const handicap18 = guestHandicap18.trim() === '' ? Number.NaN : Number(guestHandicap18);
    if (name.length < 2) { setError('Escribe el nombre del jugador'); return; }
    if (!Number.isFinite(handicap18) || handicap18 < 0 || handicap18 > 54) {
      setError('Indica un hándicap de 18 hoyos entre 0 y 54');
      return;
    }
    if (selectedPlayers.some(p => p.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setError('Ese jugador ya está en la lista');
      return;
    }
    setSelectedPlayers([...selectedPlayers, {
      key: `guest:${crypto.randomUUID()}`,
      name,
      handicap18,
    }]);
    setSearchNick('');
    setSearchResults([]);
    setGuestHandicap18('');
    setError('');
  };

  const removePlayer = (playerKey: string) => {
    setSelectedPlayers(selectedPlayers.filter(p => p.key !== playerKey));
  };

  return (
    <div className="min-h-screen bg-app transition-colors">
      <div className="max-w-lg mx-auto px-4 py-6">
        <NavigationButton destination={step === 1 || existingGroup ? "home" : "back"}
          onClick={() => {
            // Con el grupo ya creado no se vuelve a los pasos del asistente.
            if (createdGroupId) onTeamCreated(createdGroupId);
            else if (step === 1 || existingGroup) onBack();
            else setStep(step === 4 ? 2 : step - 1);
          }}
          className="flex items-center gap-2 text-ink-3 hover:text-ink mb-6"
        />

        {checkingExisting && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" />
          </div>
        )}

        {!checkingExisting && existingGroup && !createdGroupId && (
          <div className="bg-card rounded-2xl shadow-card p-6 text-center">
            <div className="w-16 h-16 bg-accent-soft rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="text-accent-ink" size={32} />
            </div>
            <h2 className="text-xl font-bold text-ink mb-2">Ya tienes tu grupo</h2>
            <p className="text-ink-3 mb-1">{existingGroup.name}</p>
            <p className="text-sm text-ink-4 mb-6">Tu plan incluye un grupo. Desde Mis grupos puedes gestionar sus jugadores y administradores.</p>
            <button
              onClick={() => onTeamCreated(existingGroup.id)}
              className="w-full bg-accent hover:bg-accent-hover text-on-accent font-semibold py-3 rounded-xl transition-colors"
            >
              Ir a Mis grupos
            </button>
          </div>
        )}

        {!checkingExisting && (!existingGroup || createdGroupId) && <>
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-2 flex-1 rounded-full transition-all ${s <= step ? 'bg-accent' : 'bg-neutral'}`} />
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl mb-4">
            {error}
          </div>
        )}

        {/* Step 1: Group name + code */}
        {step === 1 && (
          <div className="bg-card rounded-2xl shadow-card p-6">
            <h2 className="text-xl font-bold text-ink mb-1">Crear Team</h2>
            <p className="text-sm text-ink-3 mb-5">Configura tu grupo de juego</p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-ink-2 mb-1">Nombre del grupo <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Ej: Amigos del Golf"
                className="w-full px-4 py-2.5 border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-ink-2 mb-1">Codigo de acceso</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={groupCode}
                  onChange={(e) => setGroupCode(e.target.value)}
                  placeholder="Auto-generado"
                  className="flex-1 px-4 py-2.5 border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent"
                />
                <button
                  onClick={() => setGroupCode(generateCode())}
                  className="px-4 py-2.5 bg-card-2 hover:bg-neutral-hover rounded-xl text-sm font-medium text-ink-2"
                >
                  Generar
                </button>
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!groupName.trim()}
              className="w-full bg-accent hover:bg-accent-hover text-on-accent font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
            >
              Continuar
            </button>
          </div>
        )}

        {/* Step 2: 3 questions */}
        {step === 2 && (
          <div className="bg-card rounded-2xl shadow-card p-6">
            <h2 className="text-xl font-bold text-ink mb-5">Configuración del Team</h2>

            <div className="space-y-4 mb-6">
              {/* Q1: Add players now */}
              <div className="border border-line rounded-xl p-4">
                <div className="flex items-start gap-2 mb-3">
                  <p className="text-sm font-medium text-ink flex-1">
                    ¿Quieres añadir ahora algunos jugadores al grupo o prefieres hacerlo más tarde?
                  </p>
                  <Tooltip text="Puedes invitar jugadores a tu grupo ahora o en cualquier momento despues desde la gestion del grupo." />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAddPlayersNow(true)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${addPlayersNow ? 'bg-accent text-on-accent' : 'bg-card-2 text-ink-3'}`}
                  >
                    Ahora
                  </button>
                  <button
                    onClick={() => setAddPlayersNow(false)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${!addPlayersNow ? 'bg-accent text-on-accent' : 'bg-card-2 text-ink-3'}`}
                  >
                    Más tarde
                  </button>
                </div>
              </div>

              {/* Administradores: se nombran cuando los invitados ya son miembros. */}
              <div className="flex items-start gap-2 rounded-xl bg-card-2 p-4 text-sm text-ink-3">
                <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <p>Podrás nombrar administradores que te ayuden a crear partidas desde <span className="font-semibold text-ink-2">Mis grupos → Jugadores</span>, cuando los invitados hayan aceptado.</p>
              </div>

              {/* Q3: Hoyo 19 */}
              <div className="border border-line rounded-xl p-4">
                <div className="flex items-start gap-2 mb-3">
                  <p className="text-sm font-medium text-ink flex-1">
                    Quieres incluir en las partidas la Gamificacion Hoyo 19?
                  </p>
                  <Tooltip text="El Hoyo 19 incluye gamificacion DIVEND (no paso de rojas, cervezas, etc.). Se activa por defecto pero puedes desactivarlo para grupos que no beben alcohol." />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setHoyo19(true)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${hoyo19 ? 'bg-accent text-on-accent' : 'bg-card-2 text-ink-3'}`}
                  >
                    Si, incluir
                  </button>
                  <button
                    onClick={() => setHoyo19(false)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${!hoyo19 ? 'bg-accent text-on-accent' : 'bg-card-2 text-ink-3'}`}
                  >
                    No, sin alcohol
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <WriteButton
                onClick={() => addPlayersNow ? setStep(3) : void handleCreate()}
                disabled={loading}
                className="flex-1 bg-accent hover:bg-accent-hover text-on-accent font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
              >
                {addPlayersNow ? 'Añadir jugadores' : loading ? 'Creando...' : 'Crear grupo'}
              </WriteButton>
            </div>
          </div>
        )}

        {/* Step 3: Search and invite players */}
        {step === 3 && (
          <div className="bg-card rounded-2xl shadow-card p-6">
            <h2 className="text-xl font-bold text-ink mb-1">Añadir jugadores</h2>
            <p className="text-sm text-ink-3 mb-5">Busca una cuenta por nick o escribe el nombre de un jugador no registrado.</p>

            <div className="relative mb-4">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
              <input
                type="text"
                value={searchNick}
                onChange={(e) => setSearchNick(e.target.value)}
                placeholder="Nick o nombre del jugador..."
                className="w-full pl-10 pr-4 py-2.5 border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>

            {searchResults.length > 0 && (
              <div className="border border-line rounded-xl mb-4 max-h-48 overflow-y-auto">
                {searchResults.map(p => (
                  <button
                    key={p.user_id}
                    onClick={() => addPlayer(p)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-card-2 transition-colors border-b border-line last:border-b-0"
                  >
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 bg-card-2 rounded-full flex items-center justify-center">
                        <Users size={14} className="text-ink-4" />
                      </div>
                    )}
                    <div className="flex-1 text-left">
                      <p className="font-medium text-ink text-sm">{p.nick}</p>
                      <p className="text-xs text-ink-3">HCP 18: {(p.exact_handicap ?? 0).toFixed(1)} · Cuenta registrada</p>
                    </div>
                    <UserPlus size={16} className="text-accent-ink" />
                  </button>
                ))}
              </div>
            )}

            {searchNick.trim().length >= 2 && !searching && !searchResults.some(p => p.nick.toLocaleLowerCase() === searchNick.trim().toLocaleLowerCase()) && (
              <div className="border border-line rounded-xl p-4 mb-4 bg-card-2">
                <p className="text-sm font-medium text-ink mb-1">Añadir “{searchNick.trim()}” sin cuenta</p>
                <p className="text-xs text-ink-3 mb-3">Indica su hándicap de 18 hoyos. En partidas de 9 se dividirá entre dos y se redondeará.</p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    max="54"
                    step="0.1"
                    value={guestHandicap18}
                    onChange={(e) => setGuestHandicap18(e.target.value)}
                    placeholder="HCP 18 hoyos"
                    aria-label="Hándicap de 18 hoyos"
                    className="min-w-0 flex-1 px-3 py-2 border border-line-2 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
                  />
                  <WriteButton onClick={addGuest} className="px-4 py-2 bg-accent text-on-accent font-semibold rounded-lg">Añadir</WriteButton>
                </div>
              </div>
            )}

            {selectedPlayers.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium text-ink-2 mb-2">Jugadores seleccionados:</p>
                <div className="space-y-2">
                  {selectedPlayers.map(p => (
                    <div key={p.key} className="flex items-center gap-3 bg-accent-soft rounded-lg px-3 py-2">
                      {p.avatarUrl ? (
                        <img src={p.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
                      ) : (
                        <div className="w-7 h-7 bg-emerald-200 rounded-full" />
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium text-ink">{p.name}</p>
                        <p className="text-xs text-ink-3">HCP 18: {p.handicap18.toFixed(1)} · {p.registeredUserId ? 'Registrado (no editable)' : 'Sin cuenta'}</p>
                      </div>
                      <button onClick={() => removePlayer(p.key)} className="text-red-500 hover:text-red-700" aria-label={`Quitar a ${p.name}`}>
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <WriteButton
                onClick={handleCreate}
                disabled={loading}
                className="flex-1 bg-accent hover:bg-accent-hover text-on-accent font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
              >
                {loading ? 'Creando...' : `Crear grupo${selectedPlayers.length > 0 ? ` (${selectedPlayers.length} jugadores)` : ''}`}
              </WriteButton>
            </div>
          </div>
        )}

        {/* Step 4: Success */}
        {step === 4 && (
          <div className="bg-card rounded-2xl shadow-card p-8 text-center">
            <div className="w-20 h-20 bg-accent-soft rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="text-accent-ink" size={40} />
            </div>
            <h2 className="text-2xl font-bold text-ink mb-2">Grupo creado</h2>
            <p className="text-ink-3 mb-2">{groupName}</p>
            <p className="text-sm text-ink-4 mb-6">
              {selectedPlayers.length > 0
                ? 'Las cuentas registradas han recibido una invitación y los jugadores sin cuenta ya están añadidos.'
                : 'Podrás añadir jugadores más tarde'}
            </p>
            <div className="bg-card-2 rounded-xl px-4 py-3 mb-6">
              <p className="text-xs text-ink-3 mb-1">Codigo de acceso</p>
              <p className="text-2xl font-mono font-bold text-accent-ink tracking-wider">{groupCode}</p>
            </div>
            <button
              onClick={() => createdGroupId && onTeamCreated(createdGroupId)}
              className="w-full bg-accent hover:bg-accent-hover text-on-accent font-semibold py-3 rounded-xl transition-colors"
            >
              Ir al grupo
            </button>
          </div>
        )}
        </>}
      </div>
    </div>
  );
};
