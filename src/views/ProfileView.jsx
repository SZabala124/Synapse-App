import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const CAREER_OPTIONS = [
  { id: "sistemas", name: "Ingeniería de Sistemas" },
  { id: "civil", name: "Ingeniería Civil" },
  { id: "mecanica", name: "Ingeniería Mecánica" },
  { id: "electrica", name: "Ingeniería Eléctrica" },
  { id: "produccion", name: "Ingeniería de Producción" },
  { id: "quimica", name: "Ingeniería Química" },
];

export function ProfileView({ currentUser, profile, subjectSelection, pendingPayment, onOpenSubjectSelection, onSave, onSignOut }) {
  const mergedProfile = useMemo(() => ({ ...currentUser, ...(profile?.pendingCreation ? {} : profile) }), [currentUser, profile]);
  const [formState, setFormState] = useState(() => profileToForm(mergedProfile));
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useEffect(() => {
    setFormState(profileToForm(mergedProfile));
  }, [mergedProfile]);

  useEffect(() => {
    if (!saved) return undefined;
    const timer = window.setTimeout(() => setSaved(""), 2600);
    return () => window.clearTimeout(timer);
  }, [saved]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSaved("");

    try {
      validateProfileForm(formState);
      setSaving(true);
      await onSave(formState);
      setSaved("Perfil actualizado.");
    } catch (profileError) {
      setError(profileError?.message ?? "No se pudo actualizar el perfil.");
    } finally {
      setSaving(false);
    }
  }

  function updateField(field, value) {
    setFormState((current) => ({ ...current, [field]: value }));
  }

  function toggleCareer(careerId) {
    setFormState((current) => {
      const careers = new Set(current.careers);
      if (careers.has(careerId)) careers.delete(careerId);
      else careers.add(careerId);
      return { ...current, careers: Array.from(careers) };
    });
  }

  return (
    <section className="workspace profile-workspace">
      <div className="workspace-header profile-header">
        <div>
          <p className="eyebrow">Cuenta academica</p>
          <h1>Perfil de usuario</h1>
          <p>Revisa y actualiza los datos usados para personalizar tus materiales, materias y flujograma.</p>
        </div>
      </div>

      <section className="profile-card">
        <div className="profile-summary">
          <div className="profile-avatar" aria-hidden="true">
            {initials(formState.firstName, formState.lastName)}
          </div>
          <div>
            <p className="eyebrow">Sesion activa</p>
            <h2>{formState.firstName || "Usuario"} {formState.lastName}</h2>
            <span>{currentUser.email}</span>
            <div className="profile-plan-chip" aria-label={`Tipo de usuario: ${formatUserPlan(mergedProfile)}`}>
              <small>Tipo de usuario</small>
              <strong>{formatUserPlan(mergedProfile)}</strong>
            </div>
            {pendingPayment && (
              <div className="profile-payment-pending">
                <small>Pago pendiente</small>
                <strong>{formatPaymentPlan(pendingPayment)} · Bs {formatBs(pendingPayment.amountBs)}</strong>
                <span>Tu solicitud sera revisada por un admin.</span>
              </div>
            )}
          </div>
        </div>

        <form className="profile-form" onSubmit={handleSubmit}>
          <div className="profile-form-grid">
            <label>
              Nombre
              <input value={formState.firstName} onChange={(event) => updateField("firstName", onlySpanishLetters(event.target.value).slice(0, 15))} maxLength={15} required />
            </label>
            <label>
              Apellido
              <input value={formState.lastName} onChange={(event) => updateField("lastName", onlySpanishLetters(event.target.value).slice(0, 15))} maxLength={15} required />
            </label>
            <label>
              Cedula
              <input value={formState.nationalId} inputMode="numeric" onChange={(event) => updateField("nationalId", onlyDigits(event.target.value).slice(0, 9))} maxLength={9} required />
            </label>
            <label>
              Telefono
              <input value={formState.phone} inputMode="numeric" onChange={(event) => updateField("phone", onlyDigits(event.target.value).slice(0, 11))} maxLength={11} required />
            </label>
          </div>

          <fieldset className="profile-careers">
            <legend>Carrera(s)</legend>
            <div>
              {CAREER_OPTIONS.map((career) => (
                <label key={career.id}>
                  <input checked={formState.careers.includes(career.id)} type="checkbox" onChange={() => toggleCareer(career.id)} />
                  <span>{career.name}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {onOpenSubjectSelection && (
            <div className="profile-subject-selection-card">
              <div className="profile-subject-selection-content">
                <div className="profile-subject-selection-heading">
                  <strong>Materias del trimestre</strong>
                  <span>{formatSubjectSelectionMeta(subjectSelection)}</span>
                </div>
                <div className="profile-subject-selection-list" aria-label="Materias seleccionadas">
                  {buildSubjectSelectionItems(subjectSelection).map((item) => (
                    <span key={item.key} className={item.isEmpty ? "profile-subject-pill is-empty" : "profile-subject-pill"}>
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>
              <button className="profile-subject-edit-button" type="button" onClick={onOpenSubjectSelection}>
                {subjectSelection?.selectedSubjectCodes?.length ? "Cambiar materias" : "Elegir materias"}
              </button>
            </div>
          )}

          {error && <p className="auth-error">{error}</p>}
          {saved && <p className="profile-success">{saved}</p>}

          <div className="profile-actions">
            <button className="primary-action" type="submit" disabled={saving}>
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
            <button className="quiet-button danger-action" type="button" onClick={() => setConfirmSignOut(true)}>
              Cerrar sesion
            </button>
          </div>
        </form>
      </section>

      {confirmSignOut && createPortal(
        <ConfirmSignOutModal onCancel={() => setConfirmSignOut(false)} onConfirm={onSignOut} />,
        document.body,
      )}
    </section>
  );
}

function ConfirmSignOutModal({ onCancel, onConfirm }) {
  return (
    <div className="course-detail-overlay is-visible" role="dialog" aria-modal="true">
      <section className="course-detail-modal signout-confirm-modal">
        <header>
          <div>
            <h2>Cerrar sesion</h2>
            <span>Confirmacion requerida</span>
          </div>
        </header>
        <div className="course-detail-body">
          <p>Estas a punto de cerrar tu sesion activa en Synapse Academia.</p>
          <div className="profile-actions">
            <button className="quiet-button" type="button" onClick={onCancel}>Cancelar</button>
            <button className="primary-action danger-primary" type="button" onClick={onConfirm}>Si, cerrar sesion</button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function validateProfileForm(profile) {
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,15}$/.test(profile.firstName)) throw new Error("El nombre solo debe contener letras y tener máximo 15 caracteres.");
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,15}$/.test(profile.lastName)) throw new Error("El apellido solo debe contener letras y tener máximo 15 caracteres.");
  if (!/^\d{6,9}$/.test(profile.nationalId)) throw new Error("La cedula debe contener entre 6 y 9 numeros.");
  if (!/^0(2\d{2}|4(12|14|16|24|26))\d{7}$/.test(profile.phone)) throw new Error("El telefono debe ser venezolano. Ejemplo: 04121234567 o 02121234567.");
  if (!profile.careers.length) throw new Error("Selecciona al menos una carrera.");
}

function profileToForm(profile) {
  return {
    firstName: profile?.firstName ?? "",
    lastName: profile?.lastName ?? "",
    nationalId: profile?.nationalId ?? "",
    phone: profile?.phone ?? "",
    careers: Array.isArray(profile?.careers) ? profile.careers : [],
  };
}

function formatSubjectSelectionMeta(selection) {
  if (!selection) return "Cargando materias.";
  const selectedCodes = selection.selectedSubjectCodes ?? [];
  return `${selectedCodes.length}/${selection.limit ?? 7} seleccionadas · ${selection.editsRemaining ?? 0} ediciones restantes`;
}

function buildSubjectSelectionItems(selection) {
  if (!selection) return [{ key: "loading", label: "Cargando...", isEmpty: true }];
  const selectedCodes = selection.selectedSubjectCodes ?? [];
  if (selectedCodes.length === 0) return [{ key: "empty", label: "Todavia no has escogido materias", isEmpty: true }];
  return selectedCodes.map((code) => {
    const subject = selection.availableSubjects?.find((item) => item.code === code);
    return {
      key: code,
      label: subject ? `${subject.name} · ${subject.code}` : code,
      isEmpty: false,
    };
  });
}

function formatUserPlan(profile) {
  if (profile?.userType === "admin") return "Admin";
  if (profile?.plan === "excellence") return "Excellence";
  if (profile?.plan === "pro") return "Pro";
  return "Gratis";
}

function formatPaymentPlan(payment) {
  const plan = payment?.plan === "excellence" ? "Excellence" : "Pro";
  const period = payment?.billingPeriod === "quarterly" ? "trimestral" : "mensual";
  return `${plan} ${period}`;
}

function formatBs(value) {
  return Number(value ?? 0).toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function initials(firstName, lastName) {
  return `${firstName?.[0] ?? "S"}${lastName?.[0] ?? "A"}`.toUpperCase();
}

function onlySpanishLetters(value) {
  return String(value ?? "").replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
}

function onlyDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}
