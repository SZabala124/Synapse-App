import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { matchesFuzzySearch } from "../utils/fuzzySearch";

const CAREER_LABELS = {
  sistemas: "Sistemas",
  civil: "Civil",
  mecanica: "Mecánica",
  electrica: "Eléctrica",
  produccion: "Producción",
  quimica: "Química",
  psicologia: "Psicología",
  idiomas: "Idiomas Modernos",
  "estudios-internacionales": "Estudios Internacionales",
  "economia-empresarial": "Economía Empresarial",
  "contaduria-publica": "Contaduría Pública",
};

export function UsersView({ adminEmail }) {
  const users = useQuery(api.users.listForAdmin, { adminEmail }) ?? [];
  const setUserBlocked = useMutation(api.users.setUserBlocked);
  const term = useQuery(api.academicTerms.status, { adminEmail });
  const resetTerm = useMutation(api.academicTerms.reset);
  const updateTermName = useMutation(api.academicTerms.updateDisplayName);
  const [termName, setTermName] = useState("");
  const [termNameBusy, setTermNameBusy] = useState(false);
  const [termNameMessage, setTermNameMessage] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState("");
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const visibleUsers = filterUsers(users, search);

  useEffect(() => {
    setTermName(term?.displayName ?? "");
  }, [term?.displayName]);

  async function confirmBlockChange() {
    if (!confirming) return;
    setBusy(true);
    try {
      await setUserBlocked({
        adminEmail,
        targetEmail: confirming.user.email,
        blocked: confirming.action === "block",
      });
      setConfirming(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="workspace users-workspace">
      <div className="workspace-header users-header">
        <div className="materials-heading-copy">
          <p className="eyebrow">Administración</p>
          <h1>Usuarios</h1>
          <p>Revisa todas las cuentas registradas, sus datos, planes y estado de acceso dentro de Synapse.</p>
        </div>
        <div className="users-summary-card">
          <span>Total usuarios</span>
          <strong>{users.length}</strong>
        </div>
      </div>

      <div className="users-search-row">
        <button className="primary-action" type="button" disabled={resetBusy || term === undefined || term?.processing} onClick={() => { setResetError(""); setConfirmReset(true); }}>
          {term?.processing ? "Reiniciando trimestre..." : "Reseteo de Trimestre"}
        </button>
        <span role="status">{term?.processing
          ? `${term.processed} cuentas reiniciadas`
          : term ? `Próximo reinicio: ${formatDate(term.resetAt)}` : "El reinicio automático se programa al iniciar el trimestre."}</span>
      </div>

      <form className="users-search-row quarter-term-name-control" onSubmit={async (event) => {
        event.preventDefault();
        setTermNameBusy(true);
        setTermNameMessage("");
        try {
          await updateTermName({ adminEmail, displayName: termName });
          setTermNameMessage(termName.trim() ? "Nombre actualizado para todos." : "Se restauró el nombre automático.");
        } catch (error) {
          setTermNameMessage(error.message ?? "No se pudo actualizar el nombre.");
        } finally {
          setTermNameBusy(false);
        }
      }}>
        <label className="users-search-field">
          <span>Nombre visible del trimestre</span>
          <input value={termName} maxLength={60} disabled={!term || termNameBusy} placeholder={term ? new Date(term.startedAt).toLocaleDateString("es", { month: "long", year: "numeric" }) : "Trimestre no configurado"} onChange={(event) => setTermName(event.target.value)} />
        </label>
        <button className="primary-action" type="submit" disabled={!term || termNameBusy || termName === (term?.displayName ?? "")}>{termNameBusy ? "Guardando..." : "Guardar nombre"}</button>
        {termNameMessage && <span className="quarter-term-name-message" role="status">{termNameMessage}</span>}
      </form>

      <div className="users-search-row">
        <label className="users-search-field">
          <span>Buscar usuario</span>
          <input
            value={search}
            type="search"
            placeholder="Nombre, apellido o correo..."
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="users-search-count">
          <span>Resultados</span>
          <strong>{visibleUsers.length}</strong>
        </div>
      </div>

      <section className="users-admin-list" aria-label="Usuarios registrados">
        {users.length === 0 && (
          <article className="material-empty-state">
            <h3>No hay usuarios registrados</h3>
            <p>Cuando una persona cree o sincronice su perfil, aparecera aqui.</p>
          </article>
        )}
        {users.length > 0 && visibleUsers.length === 0 && (
          <article className="material-empty-state">
            <h3>No hay usuarios con esa búsqueda</h3>
            <p>Prueba buscar por nombre, apellido o correo completo.</p>
          </article>
        )}
        {visibleUsers.map((user) => {
          const isBlocked = user.userType === "blocked";
          const isAdmin = user.userType === "admin";
          return (
            <article className={isBlocked ? "user-admin-card is-blocked" : "user-admin-card"} key={user._id}>
              <div className="user-admin-head">
                <div className="user-admin-avatar" aria-hidden="true">{initials(user)}</div>
                <div>
                  <span className={isBlocked ? "user-status-pill is-blocked" : isAdmin ? "user-status-pill is-admin" : "user-status-pill"}>
                    {userTypeLabel(user.userType)}
                  </span>
                  <h2>{fullName(user)}</h2>
                  <p>{user.email}</p>
                </div>
                <strong className="user-plan-tag">{planLabel(user.plan)}</strong>
              </div>

              <dl className="user-admin-details">
                <div><dt>Documento</dt><dd>{user.nationalId || "Sin registrar"}</dd></div>
                <div><dt>Teléfono</dt><dd>{user.phone || "Sin registrar"}</dd></div>
                <div><dt>Carreras</dt><dd>{formatCareers(user.careers)}</dd></div>
                <div><dt>Materias seleccionadas</dt><dd>{formatSubjects(user.selectedSubjectCodes)}</dd></div>
                <div><dt>Vencimiento del plan</dt><dd>{formatDate(user.planExpiresAt)}</dd></div>
                <div><dt>Creado</dt><dd>{formatDate(user.createdAt)}</dd></div>
                <div><dt>Actualizado</dt><dd>{formatDate(user.updatedAt)}</dd></div>
              </dl>

              <div className="user-admin-actions">
                {user.userType !== "admin" && user.storedPlan !== "free" && (
                  <PlanExpirationEditor adminEmail={adminEmail} user={user} />
                )}
                <div className="user-admin-primary-actions">
                  <AdminPasswordReset user={user} />
                  <button
                    className={isBlocked ? "secondary-action" : "primary-action danger-primary"}
                    type="button"
                    disabled={isAdmin || user.email === adminEmail}
                    onClick={() => setConfirming({ user, action: isBlocked ? "unblock" : "block" })}
                  >
                    {isBlocked ? "Desbloquear usuario" : "Bloquear usuario"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {confirmReset && createPortal(
        <div className="course-detail-overlay subject-edit-confirm-overlay is-visible" role="dialog" aria-modal="true" aria-labelledby="reset-term-title">
          <section className="course-detail-modal subject-edit-confirm-modal">
            <header><h2 id="reset-term-title">¿Reiniciar el trimestre?</h2></header>
            <div className="course-detail-body">
              <p>Se quitarán las materias seleccionadas y los materiales Pro desbloqueados de todas las cuentas Gratis. Recuperarán sus 2 ediciones de materias.</p>
              <p>Todas las cuentas Gratis, Pro y Excellence recuperarán su cambio de carreras y conservarán las carreras seleccionadas. Los administradores seguirán sin límite.</p>
              <p>El próximo reinicio automático será dentro de 3 meses y una semana. Este cambio no se puede deshacer.</p>
              {resetError && <p className="auth-error" role="alert">{resetError}</p>}
              <div className="profile-actions">
                <button className="quiet-button" type="button" disabled={resetBusy} autoFocus onClick={() => setConfirmReset(false)}>Cancelar</button>
                <button className="primary-action danger-primary" type="button" disabled={resetBusy} onClick={async () => {
                  setResetBusy(true);
                  setResetError("");
                  try { await resetTerm({ adminEmail }); setConfirmReset(false); }
                  catch (error) { setResetError(error.message ?? "No se pudo reiniciar el trimestre."); }
                  finally { setResetBusy(false); }
                }}>{resetBusy ? "Iniciando..." : "Sí, reiniciar trimestre"}</button>
              </div>
            </div>
          </section>
        </div>, document.body,
      )}
      {confirming && createPortal(
        <UserBlockConfirmModal
          data={confirming}
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={confirmBlockChange}
        />,
        document.body
      )}
    </section>
  );
}

function AdminPasswordReset({ user }) {
  const resetPassword = useAction(api.adminPasswordReset.resetPassword);
  const [open, setOpen] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      await resetPassword({ adminKey, targetEmail: user.email, newPassword: password });
      setMessage("Contraseña restablecida. Entrégale la nueva contraseña al usuario por un canal privado.");
      setAdminKey("");
      setPassword("");
      setConfirmPassword("");
      setOpen(false);
    } catch (resetError) {
      setError(resetError?.message ?? "No se pudo restablecer la contraseña.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-password-reset-control">
      <button className="secondary-action" type="button" onClick={() => { setError(""); setOpen(true); }}>
        Restablecer contraseña
      </button>
      {message && <span role="status">{message}</span>}
      {open && createPortal(
        <div className="course-detail-overlay is-visible" role="dialog" aria-modal="true" aria-labelledby="admin-reset-password-title">
          <section className="course-detail-modal user-block-modal">
            <header><div><p className="eyebrow">Acción administrativa</p><h2 id="admin-reset-password-title">Restablecer contraseña</h2><span>{user.email}</span></div></header>
            <form className="course-detail-body auth-form" onSubmit={submit}>
              <p>La contraseña nueva sustituirá la anterior. Entrégala al usuario por un canal privado y evita reutilizarla en otras cuentas.</p>
              <label>Clave especial de administrador
                <input type="password" autoComplete="off" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} required />
              </label>
              <label>Nueva contraseña
                <input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required />
              </label>
              <label>Confirmar nueva contraseña
                <input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
              </label>
              {error && <p className="auth-error" role="alert">{error}</p>}
              <div className="profile-actions">
                <button className="quiet-button" type="button" disabled={busy} onClick={() => { setOpen(false); setAdminKey(""); setPassword(""); setConfirmPassword(""); setError(""); }}>Cancelar</button>
                <button className="primary-action danger-primary" type="submit" disabled={busy || password.length < 8 || !adminKey}>{busy ? "Restableciendo..." : "Confirmar restablecimiento"}</button>
              </div>
            </form>
          </section>
        </div>, document.body,
      )}
    </div>
  );
}

function PlanExpirationEditor({ adminEmail, user }) {
  const setUserPlanExpiration = useMutation(api.users.setUserPlanExpiration);
  const [value, setValue] = useState(() => toDateTimeLocal(user.planExpiresAt));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setValue(toDateTimeLocal(user.planExpiresAt));
  }, [user.planExpiresAt]);

  async function saveExpiration() {
    setMessage("");
    setError("");
    if (!value) {
      setError("Selecciona una fecha y hora.");
      return;
    }
    const expiresAt = new Date(value).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
      setError("La fecha y hora no son válidas.");
      return;
    }

    setBusy(true);
    try {
      await setUserPlanExpiration({ adminEmail, targetEmail: user.email, expiresAt });
      setMessage("Vencimiento actualizado.");
    } catch (saveError) {
      setError(saveError?.message ?? "No se pudo actualizar el vencimiento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="user-plan-expiration-control">
      <label>
        Cambiar vencimiento
        <input
          type="datetime-local"
          value={value}
          onChange={(event) => { setValue(event.target.value); setMessage(""); setError(""); }}
          disabled={busy}
        />
      </label>
      <button className="secondary-action" type="button" onClick={saveExpiration} disabled={busy || !value}>
        {busy ? "Guardando..." : "Guardar fecha"}
      </button>
      <small>Fecha local. Pon una fecha pasada para probar el vencimiento.</small>
      {message && <span className="user-plan-expiration-message" role="status">{message}</span>}
      {error && <span className="auth-error user-plan-expiration-error" role="alert">{error}</span>}
    </div>
  );
}

function UserBlockConfirmModal({ data, busy, onCancel, onConfirm }) {
  const isBlock = data.action === "block";
  return (
    <div className="course-detail-overlay is-visible" role="dialog" aria-modal="true">
      <section className="course-detail-modal user-block-modal">
        <header>
          <div>
            <p className="eyebrow">Confirmación requerida</p>
            <h2>{isBlock ? "Bloquear usuario" : "Desbloquear usuario"}</h2>
            <span>{data.user.email}</span>
          </div>
        </header>
        <div className="course-detail-body">
          <p>
            {isBlock
              ? "Este usuario no podrá ver ninguna sección de la app hasta que sea desbloqueado."
              : "Este usuario recuperara acceso a la app con plan Gratis, salvo que luego se le asigne otro plan."}
          </p>
          <div className="profile-actions">
            <button className="quiet-button" type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
            <button className={isBlock ? "primary-action danger-primary" : "primary-action"} type="button" onClick={onConfirm} disabled={busy}>
              {busy ? "Procesando..." : isBlock ? "Bloquear usuario" : "Desbloquear usuario"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function fullName(user) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || "Usuario sin nombre";
}

function initials(user) {
  const first = user.firstName?.[0] ?? user.email?.[0] ?? "U";
  const last = user.lastName?.[0] ?? "";
  return `${first}${last}`.toUpperCase();
}

function userTypeLabel(userType) {
  if (userType === "admin") return "Admin";
  if (userType === "blocked") return "Bloqueado";
  return "Usuario";
}

function planLabel(plan) {
  if (plan === "excellence") return "Excellence";
  if (plan === "pro") return "Pro";
  return "Gratis";
}

function formatCareers(careers = []) {
  if (!careers.length) return "Sin carrera";
  return careers.map((career) => CAREER_LABELS[career] ?? career).join(", ");
}

function formatSubjects(subjectCodes = []) {
  if (!subjectCodes.length) return "Sin selección";
  return subjectCodes.join(", ");
}

function formatDate(timestamp) {
  if (!timestamp) return "Sin registro";
  return new Date(timestamp).toLocaleString("es-VE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function toDateTimeLocal(timestamp) {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return "";
  const localDate = new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function filterUsers(users, search) {
  return users.filter((user) => matchesFuzzySearch(search, [
    user.firstName,
    user.lastName,
    fullName(user),
    user.email,
  ]));
}
