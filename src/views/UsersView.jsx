import { useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const CAREER_LABELS = {
  sistemas: "Sistemas",
  civil: "Civil",
  mecanica: "Mecánica",
  electrica: "Eléctrica",
  produccion: "Producción",
  quimica: "Química",
};

export function UsersView({ adminEmail }) {
  const users = useQuery(api.users.listForAdmin, { adminEmail }) ?? [];
  const setUserBlocked = useMutation(api.users.setUserBlocked);
  const term = useQuery(api.academicTerms.status, { adminEmail });
  const resetTerm = useMutation(api.academicTerms.reset);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState("");
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const visibleUsers = filterUsers(users, search);

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
                <div><dt>Cédula</dt><dd>{user.nationalId || "Sin registrar"}</dd></div>
                <div><dt>Teléfono</dt><dd>{user.phone || "Sin registrar"}</dd></div>
                <div><dt>Carreras</dt><dd>{formatCareers(user.careers)}</dd></div>
                <div><dt>Materias seleccionadas</dt><dd>{formatSubjects(user.selectedSubjectCodes)}</dd></div>
                <div><dt>Creado</dt><dd>{formatDate(user.createdAt)}</dd></div>
                <div><dt>Actualizado</dt><dd>{formatDate(user.updatedAt)}</dd></div>
              </dl>

              <div className="user-admin-actions">
                <button
                  className={isBlocked ? "secondary-action" : "primary-action danger-primary"}
                  type="button"
                  disabled={isAdmin || user.email === adminEmail}
                  onClick={() => setConfirming({ user, action: isBlocked ? "unblock" : "block" })}
                >
                  {isBlocked ? "Desbloquear usuario" : "Bloquear usuario"}
                </button>
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

function filterUsers(users, search) {
  const query = normalizeSearchText(search);
  if (!query) return users;
  return users.filter((user) => normalizeSearchText([
    user.firstName,
    user.lastName,
    fullName(user),
    user.email,
  ].join(" ")).includes(query));
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
