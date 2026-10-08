import { useEffect, useRef, useState } from "react";
import {
  adminService,
  type ManagedRound,
  type ManagedRoundDetail,
  type ManagedUserRow,
} from "../../services/adminService";
import { NavigationButton } from "../NavigationButton";
const labels: Record<string, string> = {
  active: "En curso",
  completed: "Finalizada",
  archived: "Archivada",
  cancelled: "Cancelada",
  deleted: "Eliminada por jugador",
  withdrawn: "Retirada por admin",
};
const actions: Record<string, string> = {
  complete: "Finalizar",
  reopen: "Reabrir",
  withdraw: "Retirar",
  restore: "Restaurar",
};
const input = "w-full bg-card border border-line rounded-xl p-3";
const message = (e: unknown) =>
  e && typeof e === "object" && "message" in e
    ? String(e.message)
    : "No se pudo completar la operación.";
const status = (r: ManagedRound) =>
  r.admin_withdrawn_at ? "Retirada por admin" : labels[r.status] || r.status;
export function AdminRounds() {
  const [search, setSearch] = useState(""),
    [state, setState] = useState(""),
    [kind, setKind] = useState(""),
    [mode, setMode] = useState(""),
    [group, setGroup] = useState(""),
    [page, setPage] = useState(0),
    [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<ManagedRound[]>([]),
    [total, setTotal] = useState(0),
    [detail, setDetail] = useState<ManagedRoundDetail | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const d = await adminService.rounds(
          search,
          state,
          kind,
          page,
          mode,
          group,
        );
        if (live) {
          setRows(d.rounds);
          setTotal(d.total);
        }
      } catch (e) {
        if (live) {
          setRows([]);
          setError(message(e));
        }
      } finally {
        if (live) setLoading(false);
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [search, state, kind, page, mode, group, revision]);
  if (detail)
    return (
      <RoundDetail
        key={detail.round.id}
        initial={detail}
        onBack={() => {
          setDetail(null);
          setRevision((v) => v + 1);
        }}
      />
    );
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold">Partidas</h2>
      <div className="grid sm:grid-cols-3 gap-3">
        <label>
          Buscar
          <input
            className={input}
            maxLength={200}
            value={search}
            placeholder="Referencia, UUID, campo o jugador"
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          Estado
          <select
            className={input}
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Todos</option>
            {Object.entries(labels).map(([v, l]) => (
              <option value={v} key={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <select
            className={input}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setMode("");
              setGroup("");
              setPage(0);
            }}
          >
            <option value="">Todas</option>
            <option value="quick">Rápidas</option>
            <option value="group">De grupo (consulta)</option>
          </select>
        </label>
        {kind === "quick" && (
          <label>
            Modalidad
            <select
              className={input}
              value={mode}
              onChange={(e) => {
                setMode(e.target.value);
                setPage(0);
              }}
            >
              <option value="">Todas las modalidades</option>
              <option value="stableford">Stableford</option>
              <option value="match">Match</option>
              <option value="sindicato">Sindicato</option>
              <option value="parejas">Parejas</option>
            </select>
          </label>
        )}
        {kind === "group" && (
          <label>
            Buscar grupo
            <input
              className={input}
              maxLength={200}
              value={group}
              placeholder="Nombre, código o UUID del grupo"
              onChange={(e) => {
                setGroup(e.target.value);
                setPage(0);
              }}
            />
          </label>
        )}
      </div>
      <button
        disabled={loading}
        onClick={() => setRevision((v) => v + 1)}
        className="border rounded-xl p-3"
      >
        Actualizar
      </button>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Cargando…</p>
      ) : (
        rows.map((r) => (
          <button
            key={r.id}
            className="w-full text-left bg-card border border-line p-4 rounded-xl"
            onClick={async () => {
              setLoading(true);
              setError("");
              try {
                setDetail(await adminService.round(r.id));
              } catch (e) {
                setError(message(e));
              } finally {
                setLoading(false);
              }
            }}
          >
            <span className="block font-bold">
              #{r.reference_number} · {r.course_name}
            </span>
            <span className="block">
              {status(r)} · {r.game_mode} · {r.num_holes} hoyos ·{" "}
              {r.players_count} jugadores
            </span>
            <span className="text-sm text-ink-3">
              {r.group_id
                ? `Grupo: ${r.group_name || r.group_code || r.group_id}`
                : "Rápida"}{" "}
              · {new Date(r.created_at).toLocaleString("es-ES")}
            </span>
          </button>
        ))
      )}
      {!loading && !rows.length && !error && (
        <p>No hay partidas con estos filtros.</p>
      )}
      <div className="flex gap-3 items-center">
        <button
          disabled={loading || page === 0}
          onClick={() => setPage((p) => p - 1)}
          className="border rounded-xl p-2 disabled:opacity-40"
        >
          Anterior
        </button>
        <span>
          {total} partidas · Página {page + 1}
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
function RoundDetail({
  initial,
  onBack,
}: {
  initial: ManagedRoundDetail;
  onBack: () => void;
}) {
  const [detail, setDetail] = useState(initial),
    [action, setAction] = useState(""),
    [reason, setReason] = useState(""),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [reassigning, setReassigning] = useState(false),
    [userSearch, setUserSearch] = useState(""),
    [userResults, setUserResults] = useState<ManagedUserRow[]>([]),
    [selectedUser, setSelectedUser] = useState<ManagedUserRow | null>(null),
    [reassignReason, setReassignReason] = useState(""),
    [reassignConfirm, setReassignConfirm] = useState(false);
  const running = useRef(false);
  const r = detail.round;
  const allowed = r.group_id
    ? []
    : r.admin_withdrawn_at
      ? ["restore"]
      : [
          ...(r.status === "active"
            ? ["complete"]
            : ["completed", "archived"].includes(r.status)
              ? ["reopen"]
              : []),
          "withdraw",
        ];
  const save = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      setDetail(await adminService.changeRound(r, action, reason));
      setAction("");
      setSuccess("Cambio guardado y registrado en Actividad.");
    } catch (e) {
      setError(message(e));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const searchUsers = async () => {
    if (userSearch.trim().length < 2) return;
    setBusy(true);
    setError("");
    try {
      const result = await adminService.users(userSearch.trim(), "", null, 0);
      setUserResults(result.users);
      if (result.users.length === 0) setError("No se ha encontrado ningún jugador registrado.");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const reassign = async () => {
    if (running.current || !selectedUser) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      setDetail(await adminService.reassignRound(r, selectedUser.user_id, reassignReason));
      setReassigning(false);
      setSelectedUser(null);
      setUserResults([]);
      setUserSearch("");
      setReassignReason("");
      setReassignConfirm(false);
      setSuccess("Partida reasignada y registrada en Actividad.");
    } catch (e) {
      setError(message(e));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="space-y-4">
      <NavigationButton onClick={onBack} disabled={busy} />
      <h2 className="text-xl font-bold">
        Partida #{r.reference_number} · {detail.course_name}
      </h2>
      <div className="bg-card border border-line rounded-xl p-4 space-y-2 break-words">
        <p>
          {status(r)} · {r.game_mode} · {r.num_holes} hoyos
        </p>
        <p>UUID de partida: {r.id}</p>
        <p>Identificador de origen: {r.user_id}</p>
        <p className="text-sm text-ink-3">
          El identificador de origen puede ser del dispositivo; no implica una
          cuenta registrada.
        </p>
        <p>Creada: {new Date(r.created_at).toLocaleString("es-ES")}</p>
        {r.group_id && <p>Grupo: {r.group_id} · Solo consulta en esta fase.</p>}
        {r.completed_at && (
          <p>Finalizada: {new Date(r.completed_at).toLocaleString("es-ES")}</p>
        )}
        {r.admin_withdrawn_at && (
          <p>
            Retirada: {new Date(r.admin_withdrawn_at).toLocaleString("es-ES")} ·
            Estado a restaurar:{" "}
            {labels[r.admin_previous_status || ""] || r.admin_previous_status}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        {allowed.map((a) => (
          <button
            key={a}
            disabled={busy || !!action}
            className="border border-line rounded-xl p-3 disabled:opacity-40"
            onClick={() => {
              setAction(a);
              setReassigning(false);
              setReason("");
              setConfirm(false);
              setError("");
              setSuccess("");
            }}
          >
            {actions[a]}
          </button>
        ))}
        {!r.group_id && !r.admin_withdrawn_at && (
          <button
            disabled={busy || !!action}
            className="border border-line rounded-xl p-3 disabled:opacity-40"
            onClick={() => {
              setReassigning(true);
              setAction("");
              setError("");
              setSuccess("");
            }}
          >
            Reasignar a jugador
          </button>
        )}
        <button
          disabled={busy}
          className="border rounded-xl p-3"
          onClick={async () => {
            setBusy(true);
            try {
              setDetail(await adminService.round(r.id));
              setAction("");
              setError("");
            } catch (e) {
              setError(message(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Actualizar ficha
        </button>
      </div>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {success && <p role="status">{success}</p>}
      {action && (
        <form
          className="bg-card border border-line rounded-xl p-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (confirm) void save();
            else setConfirm(true);
          }}
        >
          <h3 className="font-bold">{actions[action]} partida</h3>
          <p>
            {action === "withdraw"
              ? "Se conservarán jugadores y puntuaciones. La partida saldrá de los listados de juego y dejará de consumir un hueco de Express."
              : action === "restore"
                ? "Volverá al estado anterior y contará otra vez para el límite de Express, aunque el total supere cuatro."
                : action === "complete"
                  ? "Solo se finalizará si todos los jugadores tienen informados todos los hoyos. Una raya cuenta como resultado informado."
                  : "Volverá a estar en curso, conservando las puntuaciones. Dejará de aparecer entre las finalizadas."}
          </p>
          <label className="block">
            Motivo obligatorio (mínimo 3 caracteres)
            <textarea
              className={input}
              required
              minLength={3}
              maxLength={500}
              value={reason}
              disabled={busy || confirm}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {confirm && (
            <p>
              Confirma {actions[action].toLowerCase()} la partida #
              {r.reference_number}. Quedará registrado a tu nombre.
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              disabled={busy}
              className="border rounded-xl p-3"
              onClick={() => (confirm ? setConfirm(false) : setAction(""))}
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
      {reassigning && (
        <form
          className="bg-card border border-line rounded-xl p-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (reassignConfirm) void reassign();
            else if (selectedUser) setReassignConfirm(true);
            else void searchUsers();
          }}
        >
          <h3 className="font-bold">Reasignar partida a un jugador registrado</h3>
          <p>La partida aparecerá en la cuenta elegida. Se conservarán todos sus jugadores y resultados.</p>
          <label className="block">
            Buscar por correo, nick o nombre
            <div className="flex gap-2">
              <input
                className={input}
                minLength={2}
                maxLength={200}
                value={userSearch}
                disabled={busy || reassignConfirm}
                onChange={(e) => {
                  setUserSearch(e.target.value);
                  setSelectedUser(null);
                  setReassignConfirm(false);
                }}
              />
              <button type="button" disabled={busy || userSearch.trim().length < 2 || reassignConfirm} className="border rounded-xl px-4 disabled:opacity-40" onClick={() => void searchUsers()}>
                Buscar
              </button>
            </div>
          </label>
          {!reassignConfirm && userResults.length > 0 && (
            <div className="space-y-2" role="listbox" aria-label="Jugadores encontrados">
              {userResults.map((user) => (
                <button
                  type="button"
                  key={user.user_id}
                  className={`w-full text-left border rounded-xl p-3 ${selectedUser?.user_id === user.user_id ? "border-accent bg-accent/10" : "border-line"}`}
                  onClick={() => setSelectedUser(user)}
                >
                  <span className="font-semibold">{user.display_name || user.nick || user.email}</span>
                  <span className="block text-sm text-ink-3">{user.email} · Plan {user.plan}</span>
                </button>
              ))}
            </div>
          )}
          {selectedUser && (
            <label className="block">
              Motivo obligatorio (mínimo 3 caracteres)
              <textarea className={input} required minLength={3} maxLength={500} value={reassignReason} disabled={busy || reassignConfirm} onChange={(e) => setReassignReason(e.target.value)} />
            </label>
          )}
          {reassignConfirm && selectedUser && (
            <p>Confirma que la partida #{r.reference_number} pasará de <strong>{r.user_id}</strong> a <strong>{selectedUser.display_name || selectedUser.nick || selectedUser.email}</strong>.</p>
          )}
          <div className="flex gap-3">
            <button type="button" disabled={busy} className="border rounded-xl p-3" onClick={() => reassignConfirm ? setReassignConfirm(false) : setReassigning(false)}>
              {reassignConfirm ? "Revisar" : "Cancelar"}
            </button>
            {selectedUser && (
              <button disabled={busy || reassignReason.trim().length < 3} className="bg-accent text-on-accent rounded-xl p-3 disabled:opacity-40">
                {busy ? "Guardando…" : reassignConfirm ? "Confirmar y reasignar" : "Revisar reasignación"}
              </button>
            )}
          </div>
        </form>
      )}
      <h3 className="font-bold">Jugadores y resultados (solo consulta)</h3>
      {detail.players.length === 0 && <p>Sin jugadores.</p>}
      {detail.players.map((p) => {
        const scores = detail.scores.filter((s) => s.player_id === p.id);
        return (
          <details
            key={p.id}
            className="bg-card border border-line rounded-xl p-4"
          >
            <summary>
              {p.name} · Hándicap {p.exact_handicap} · {scores.length} hoyos
              registrados ·{" "}
              {scores.reduce(
                (n, s) =>
                  n +
                  (r.game_mode === "stableford"
                    ? s.stableford_points
                    : s.mode_points || 0),
                0,
              )}{" "}
              puntos
            </summary>
            <div className="overflow-x-auto">
              <table className="w-full text-sm mt-3 text-left">
                <thead>
                  <tr>
                    <th>Hoyo</th>
                    <th>Golpes</th>
                    <th>Netos</th>
                    <th>Stableford</th>
                    <th>Modalidad</th>
                    <th>Abandono</th>
                  </tr>
                </thead>
                <tbody>
                  {scores.map((s) => (
                    <tr key={s.id}>
                      <td>{s.hole_number}</td>
                      <td>{s.gross_strokes}</td>
                      <td>{s.net_strokes}</td>
                      <td>{s.stableford_points}</td>
                      <td>{s.mode_points}</td>
                      <td>{s.abandoned ? "Sí" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        );
      })}
    </section>
  );
}
