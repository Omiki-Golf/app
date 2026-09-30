import { useCallback, useEffect, useRef, useState } from "react";
import {
  adminService,
  type ManagedUser,
  type ManagedUserRow,
  type UserInsights,
} from "../../services/adminService";
import { BarList, Panel, Stat, WeekStrip } from "./AdminCharts";
import { modeLabels, shortDate, sinceLabel } from "./adminFormat";
import {
  AVATAR_OPTIONS,
  DEFAULT_AVATAR_URL,
  normalizeAvatarUrl,
} from "../../utils/avatarOptions";
import { NavigationButton } from "../NavigationButton";
const input = "w-full bg-card border border-line rounded-xl p-3";
const errorText = (e: unknown) =>
  e && typeof e === "object" && "message" in e
    ? String(e.message)
    : "No se pudo completar la operación.";
const showDate = (v: string) => new Date(v).toLocaleString("es-ES");

/** `openUserId` opens that player's record directly; going back then calls `onExit`. */
export function AdminUsers({
  openUserId,
  onExit,
}: { openUserId?: string; onExit?: () => void } = {}) {
  const [search, setSearch] = useState(""),
    [plan, setPlan] = useState(""),
    [blocked, setBlocked] = useState(""),
    [page, setPage] = useState(0);
  const [users, setUsers] = useState<ManagedUserRow[]>([]),
    [total, setTotal] = useState(0),
    [selected, setSelected] = useState<ManagedUser | null>(null);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const version = useRef(0);
  const load = useCallback(async () => {
    const id = ++version.current;
    setLoading(true);
    setError("");
    try {
      const data = await adminService.users(
        search,
        plan,
        blocked === "" ? null : blocked === "yes",
        page,
      );
      if (id === version.current) {
        setUsers(data.users);
        setTotal(data.total);
      }
    } catch (e) {
      if (id === version.current) {
        setUsers([]);
        setError(errorText(e));
      }
    } finally {
      if (id === version.current) setLoading(false);
    }
  }, [search, plan, blocked, page]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => {
      clearTimeout(timer);
      // Request generation counter, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      version.current++;
    };
  }, [load, revision]);
  const open = async (id: string) => {
    setError("");
    setLoading(true);
    try {
      setSelected(await adminService.user(id));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (openUserId) void open(openUserId);
  }, [openUserId]);
  if (selected)
    return (
      <UserDetail
        key={selected.user_id}
        initial={selected}
        onBack={() => {
          if (openUserId && onExit) return onExit();
          setSelected(null);
          setRevision((v) => v + 1);
        }}
      />
    );
  return (
    <section className="space-y-4">
      <h2 className="font-bold text-xl">Jugadores</h2>
      <div className="grid sm:grid-cols-3 gap-3">
        <label>
          Buscar
          <input
            className={input}
            placeholder="Correo, nombre, nick o UUID"
            value={search}
            maxLength={200}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          Plan
          <select
            className={input}
            value={plan}
            onChange={(e) => {
              setPlan(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Todos</option>
            {["express", "player", "team", "premium"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Estado
          <select
            className={input}
            value={blocked}
            onChange={(e) => {
              setBlocked(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Todos</option>
            <option value="yes">Solo lectura</option>
            <option value="no">Sin bloqueo</option>
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      <button
        className="border border-line rounded-xl p-2"
        disabled={loading}
        onClick={() => setRevision((v) => v + 1)}
      >
        Actualizar usuarios
      </button>
      {loading ? (
        <p role="status">Cargando…</p>
      ) : (
        users.map((u) => (
          <button
            key={u.user_id}
            onClick={() => void open(u.user_id)}
            className="text-left w-full bg-card border border-line rounded-xl p-4"
          >
            <span className="block font-semibold">
              {u.nick || "Registro pendiente"} · {u.plan}
            </span>
            <span className="block break-all">{u.email}</span>
            <span className="text-sm text-ink-3">
              {u.display_name} {u.read_only ? "· Solo lectura" : ""}
            </span>
            <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2 tabular-nums">
              <span>
                <b>{u.rounds_played}</b> partidas
              </span>
              <span>Última partida: {sinceLabel(u.last_round_at)}</span>
              <span>
                <b>{u.groups_count}</b> grupos
              </span>
              <span>Último inicio de sesión: {sinceLabel(u.last_sign_in_at)}</span>
            </span>
          </button>
        ))
      )}
      {!loading && !error && !users.length && (
        <p>No hay usuarios con estos filtros.</p>
      )}
      <div className="flex items-center gap-3">
        <button
          disabled={loading || page === 0}
          onClick={() => setPage((p) => p - 1)}
          className="border rounded-xl p-2 disabled:opacity-40"
        >
          Anterior
        </button>
        <span>
          {total} usuarios · Página {page + 1}
        </span>
        <button
          disabled={loading || (page + 1) * 25 >= total}
          onClick={() => setPage((p) => p + 1)}
          className="border rounded-xl p-2 disabled:opacity-40"
        >
          Siguiente
        </button>
      </div>
    </section>
  );
}
function UserDetail({
  initial,
  onBack,
}: {
  initial: ManagedUser;
  onBack: () => void;
}) {
  const [user, setUser] = useState(initial),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [action, setAction] = useState<
      "profile" | "plan" | "restriction" | null
    >(null),
    [reason, setReason] = useState(""),
    [confirm, setConfirm] = useState(false);
  const [profile, setProfile] = useState(initial.profile),
    [plan, setPlan] = useState(initial.plan),
    [indefinite, setIndefinite] = useState(false),
    [end, setEnd] = useState("");
  const running = useRef(false);
  const begin = (next: typeof action) => {
    setError("");
    setMessage("");
    setReason("");
    setConfirm(false);
    setProfile(
      user.profile
        ? {
            ...user.profile,
            avatar_url: normalizeAvatarUrl(user.profile.avatar_url),
          }
        : null,
    );
    setPlan(user.plan);
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    setEnd(
      new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16),
    );
    setIndefinite(false);
    setAction(next);
  };
  const values = () =>
    action === "profile"
      ? {
          nick: profile?.nick,
          display_name: profile?.display_name,
          avatar_url: profile?.avatar_url || DEFAULT_AVATAR_URL,
          exact_handicap: profile?.exact_handicap,
          default_tee: profile?.default_tee,
        }
      : action === "plan"
        ? {
            plan,
            end:
              plan === "express" || indefinite
                ? null
                : new Date(end).toISOString(),
          }
        : { read_only: !user.read_only };
  const save = async () => {
    if (!action || running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      setUser(
        await adminService.updateUser(user, action, values(), reason.trim()),
      );
      setAction(null);
      setMessage("Cambio guardado y registrado en Actividad.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="space-y-4">
      <NavigationButton onClick={onBack} disabled={busy} />
      <h2 className="text-xl font-bold">
        {user.profile?.nick || "Registro pendiente"}
      </h2>
      <dl className="bg-card border border-line rounded-xl p-4 grid grid-cols-[minmax(6rem,0.4fr)_minmax(0,1fr)] gap-x-4 gap-y-3 items-baseline [&>dt]:text-ink-3 [&>dd]:break-words [&>dd]:min-w-0">
        <dt>Correo</dt>
        <dd>{user.email}</dd>
        <dt>UUID</dt>
        <dd className="break-all">{user.user_id}</dd>
        <dt>Alta</dt>
        <dd>{showDate(user.created_at)}</dd>
        <dt>Plan efectivo</dt>
        <dd>{user.plan}</dd>
        <dt>Caducidad</dt>
        <dd>
          {user.subscription?.current_period_end
            ? showDate(user.subscription.current_period_end)
            : user.plan === "express"
              ? "Sin caducidad"
              : "Indefinido"}
        </dd>
        <dt>Estado</dt>
        <dd>{user.read_only ? "Solo lectura" : "Sin bloqueo"}</dd>
        <dt>Condiciones aceptadas</dt>
        <dd>{user.profile?.accepted_terms ? "Sí" : "No"}</dd>
        {user.profile && (
          <>
            <dt>Nombre</dt>
            <dd>{user.profile.display_name || "—"}</dd>
            <dt>Nick</dt>
            <dd>{user.profile.nick}</dd>
            <dt>Avatar</dt>
            <dd>
              <img
                src={normalizeAvatarUrl(user.profile.avatar_url)}
                alt="Avatar del jugador"
                className="w-12 h-12 rounded-full"
              />
            </dd>
            <dt>Hándicap</dt>
            <dd>{user.profile.exact_handicap}</dd>
            <dt>Barras</dt>
            <dd className="capitalize">{user.profile.default_tee}</dd>
          </>
        )}
      </dl>
      <UserUsage userId={user.user_id} />
      <div className="flex flex-wrap gap-3">
        <button
          disabled={busy || !!action || !user.profile}
          className="border rounded-xl p-3 disabled:opacity-40"
          onClick={() => begin("profile")}
        >
          Editar perfil
        </button>
        <button
          disabled={busy || !!action}
          className="border rounded-xl p-3"
          onClick={() => begin("plan")}
        >
          Asignar plan
        </button>
        <button
          disabled={busy || !!action}
          className="border border-red-200 text-red-600 rounded-xl p-3"
          onClick={() => begin("restriction")}
        >
          {user.read_only ? "Desbloquear" : "Bloquear cambios"}
        </button>
        <button
          disabled={busy}
          className="border rounded-xl p-3"
          onClick={async () => {
            try {
              setUser(await adminService.user(user.user_id));
              setAction(null);
              setError("");
            } catch (e) {
              setError(errorText(e));
            }
          }}
        >
          Actualizar ficha
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {action && (
        <form
          className="bg-card border border-line rounded-xl p-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (confirm) void save();
            else setConfirm(true);
          }}
        >
          <h3 className="font-bold">
            {confirm
              ? "Confirmar cambio"
              : action === "profile"
                ? "Editar perfil"
                : action === "plan"
                  ? "Asignar plan"
                  : user.read_only
                    ? "Desbloquear usuario"
                    : "Bloquear cambios del usuario"}
          </h3>
          <fieldset disabled={busy || confirm} className="space-y-4">
            {action === "profile" && profile && (
              <>
                <label className="grid grid-cols-[minmax(6rem,0.4fr)_minmax(0,1fr)] gap-4 items-center">
                  Nombre
                  <input
                    className={input}
                    required
                    maxLength={100}
                    value={profile.display_name || ""}
                    onChange={(e) =>
                      setProfile({ ...profile, display_name: e.target.value })
                    }
                  />
                </label>
                <label className="grid grid-cols-[minmax(6rem,0.4fr)_minmax(0,1fr)] gap-4 items-center">
                  Nick
                  <input
                    className={input}
                    required
                    minLength={2}
                    maxLength={50}
                    value={profile.nick}
                    onChange={(e) =>
                      setProfile({ ...profile, nick: e.target.value })
                    }
                  />
                </label>
                <label className="grid grid-cols-[minmax(6rem,0.4fr)_minmax(0,1fr)] gap-4 items-center">
                  Avatar
                  <select
                    className={input}
                    value={profile.avatar_url || DEFAULT_AVATAR_URL}
                    onChange={(e) =>
                      setProfile({ ...profile, avatar_url: e.target.value })
                    }
                  >
                    {AVATAR_OPTIONS.map((a) => (
                      <option key={a.id} value={a.url}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid grid-cols-[minmax(6rem,0.4fr)_minmax(0,1fr)] gap-4 items-center">
                  Hándicap
                  <input
                    className={input}
                    required
                    type="number"
                    step="0.1"
                    value={profile.exact_handicap}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        exact_handicap: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="grid grid-cols-[minmax(6rem,0.4fr)_minmax(0,1fr)] gap-4 items-center">
                  Barras
                  <select
                    className={input}
                    value={profile.default_tee}
                    onChange={(e) =>
                      setProfile({ ...profile, default_tee: e.target.value })
                    }
                  >
                    {["amarillo", "rojo", "blanco", "azul"].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {action === "plan" && (
              <>
                <label className="grid grid-cols-[minmax(6rem,0.4fr)_minmax(0,1fr)] gap-4 items-center">
                  Plan
                  <select
                    className={input}
                    value={plan}
                    onChange={(e) => setPlan(e.target.value as typeof plan)}
                  >
                    {["express", "player", "team", "premium"].map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                {plan !== "express" && (
                  <>
                    <label className="block">
                      <input
                        type="checkbox"
                        checked={indefinite}
                        onChange={(e) => setIndefinite(e.target.checked)}
                      />{" "}
                      Sin caducidad
                    </label>
                    {!indefinite && (
                      <label className="grid grid-cols-[minmax(6rem,0.4fr)_minmax(0,1fr)] gap-4 items-center">
                        Fecha y hora de fin (hora local)
                        <input
                          className={input}
                          type="datetime-local"
                          required
                          value={end}
                          onChange={(e) => setEnd(e.target.value)}
                        />
                      </label>
                    )}
                  </>
                )}
                <p>
                  El simulador puede sustituir esta asignación si la cuenta no
                  está bloqueada. Cambiar el plan no borra partidas ni grupos.
                </p>
              </>
            )}
            {action === "restriction" && (
              <p>
                {user.read_only
                  ? "Recuperará las acciones de su plan vigente."
                  : "Podrá consultar y recuperar su contraseña, pero no modificar datos ni jugar. Se conservarán sus partidas y grupos; la caducidad del plan seguirá contando."}
              </p>
            )}
            <label className="grid grid-cols-[minmax(6rem,0.4fr)_minmax(0,1fr)] gap-4 items-center">
              Motivo
              <textarea
                className={input}
                required
                minLength={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          </fieldset>
          {confirm && (
            <p>
              Se aplicará este cambio a {user.email} y quedará registrado a tu
              nombre.
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              disabled={busy}
              className="border rounded-xl p-3"
              onClick={() => (confirm ? setConfirm(false) : setAction(null))}
            >
              {confirm ? "Revisar" : "Cancelar"}
            </button>
            <button
              disabled={busy || reason.trim().length < 3}
              className="bg-accent text-on-accent rounded-xl p-3 disabled:opacity-40"
            >
              {busy
                ? "Guardando…"
                : confirm
                  ? "Confirmar y guardar"
                  : "Revisar cambio"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
function UserUsage({ userId }: { userId: string }) {
  const [data, setData] = useState<UserInsights | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    setData(null);
    setError("");
    adminService
      .userInsights(userId)
      .then((d) => current && setData(d))
      .catch((e) => current && setError(errorText(e)));
    return () => {
      current = false;
    };
  }, [userId]);
  if (error)
    return (
      <p role="alert" className="text-red-600">
        {error}
      </p>
    );
  if (!data) return <p role="status">Cargando uso…</p>;
  const { rounds, invitations_sent: sent } = data;
  const months = rounds.first_at
    ? Math.max(1, (Date.now() - new Date(rounds.first_at).getTime()) / 2629800000)
    : 0;
  return (
    <section className="space-y-3">
      <h3 className="font-bold text-lg">Uso</h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Partidas jugadas"
          value={rounds.played}
          detail={`${rounds.group} de grupo · ${rounds.quick} rápidas`}
        />
        <Stat
          label="Partidas al mes"
          value={
            months
              ? (rounds.played / months).toLocaleString("es-ES", {
                  maximumFractionDigits: 1,
                })
              : "—"
          }
          detail={`${rounds.last_90} en los últimos 90 días`}
        />
        <Stat
          label="Última partida"
          value={sinceLabel(rounds.last_at)}
          detail={shortDate(rounds.last_at)}
        />
        <Stat
          label="Último inicio de sesión"
          value={sinceLabel(data.last_sign_in_at)}
          detail="La app mantiene la sesión abierta"
        />
      </div>
      <Panel title="Actividad" note="partidas por semana, últimas 26 semanas">
        <WeekStrip weeks={data.weekly} />
      </Panel>
      <div className="grid md:grid-cols-2 gap-3">
        <Panel title="Campos y recorridos">
          <BarList
            empty="Sin partidas vinculadas a su cuenta."
            rows={data.courses.map((c) => ({
              label: [c.course, c.tee, c.holes].filter(Boolean).join(" · "),
              value: c.count,
            }))}
          />
        </Panel>
        <Panel title="Modalidades">
          <BarList
            empty="Sin partidas vinculadas a su cuenta."
            rows={data.modes.map((m) => ({
              label: modeLabels[m.mode] ?? m.mode,
              value: m.count,
            }))}
          />
        </Panel>
        <Panel
          title="Grupos"
          note={`${data.groups_created} creados · ${data.groups.length} en total`}
        >
          {data.groups.length ? (
            <ul className="grid gap-2 text-sm">
              {data.groups.map((g) => (
                <li
                  key={g.id}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="min-w-0 truncate">
                    {g.name || g.group_code}
                    {g.owner ? (
                      <span className="ml-2 text-xs text-accent-ink font-semibold">
                        Creador
                      </span>
                    ) : g.role === "admin" ? (
                      <span className="ml-2 text-xs text-accent-ink font-semibold">
                        Administra
                      </span>
                    ) : null}
                    <span className="block text-xs text-ink-3">
                      {g.members} miembros · última partida suya:{" "}
                      {sinceLabel(g.last_round_at).toLowerCase()}
                    </span>
                  </span>
                  <span className="tabular-nums font-semibold">{g.rounds}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">No pertenece a ningún grupo.</p>
          )}
        </Panel>
        <Panel title="Invitaciones a grupos enviadas">
          <p className="text-sm tabular-nums">
            <b>{sent.total}</b> enviadas · {sent.accepted} aceptadas ·{" "}
            {sent.pending} pendientes
          </p>
        </Panel>
      </div>
      <p className="text-xs text-ink-3">
        Solo se cuentan las partidas en las que figura con su cuenta. Las
        partidas no guardan quién las creó, así que aún no se pueden mostrar
        las partidas creadas.
      </p>
    </section>
  );
}
