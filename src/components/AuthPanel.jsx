import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import logoUrl from "../../Synapse.svg";

const CAREER_OPTIONS = [
  { id: "sistemas", name: "Ingeniería de Sistemas" },
  { id: "civil", name: "Ingeniería Civil" },
  { id: "mecanica", name: "Ingeniería Mecánica" },
  { id: "electrica", name: "Ingeniería Eléctrica" },
  { id: "produccion", name: "Ingeniería de Producción" },
  { id: "quimica", name: "Ingeniería Química" },
];

export function AuthPanel({ initialMode = "signIn", onBack, onAuthSuccess, convexEnabled = false }) {
  const [mode, setMode] = useState(initialMode);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [profileFields, setProfileFields] = useState({
    firstName: "",
    lastName: "",
    nationalId: "",
    phone: "",
  });
  const [authFields, setAuthFields] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    resetNationalId: "",
    resetPassword: "",
    resetConfirmPassword: "",
  });
  const recoverLocalAccess = useMutation(api.users.recoverLocalAccess);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  async function handlePassword(event) {
    event.preventDefault();
    if (submitting) return;
    setError("");
    const formData = new FormData(event.currentTarget);
    if (mode === "signUp" && formData.get("password") !== formData.get("confirmPassword")) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (mode === "forgotPassword" && formData.get("resetPassword") !== formData.get("resetConfirmPassword")) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    formData.set("flow", mode);
    formData.delete("confirmPassword");
    try {
      setSubmitting(true);
      const email = String(formData.get("email")).trim().toLowerCase();
      if (mode === "forgotPassword") {
        const nextPassword = String(formData.get("resetPassword"));
        const nationalId = String(formData.get("resetNationalId"));
        const recoveredProfile = convexEnabled
          ? await recoverLocalAccess({ email, nationalId })
          : null;
        resetLocalPassword(email, nationalId, nextPassword, recoveredProfile);
        setAuthFields((current) => ({
          ...current,
          email,
          password: "",
          confirmPassword: "",
          resetNationalId: "",
          resetPassword: "",
          resetConfirmPassword: "",
        }));
        setMode("signIn");
        setNotice("Contraseña actualizada. Ya puedes iniciar sesión con la nueva contraseña.");
        return;
      }
      const password = String(formData.get("password"));
      const user = mode === "signUp" ? createLocalAccount(email, password, readProfileForm(formData)) : signInLocalAccount(email, password);
      onAuthSuccess(user);
    } catch (authError) {
      setError(authError?.message ?? "No se pudo completar el acceso.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        {onBack && (
          <button className="auth-back-button" type="button" onClick={onBack} aria-label="Volver">
            ←
          </button>
        )}
        <div className="auth-logo-lockup">
          <img src={logoUrl} alt="" aria-hidden="true" />
          <span>Synapse Academia</span>
        </div>
        <h1>{mode === "signIn" ? "Inicia sesión" : mode === "signUp" ? "Crea tu cuenta" : "Recupera tu contraseña"}</h1>
        <p>
          {mode === "forgotPassword"
            ? "Confirma tu correo y tu cédula para definir una contraseña nueva en este navegador."
            : "Accede con correo y contraseña. Google lo dejamos para una siguiente etapa."}
        </p>

        <form className="auth-form" onSubmit={handlePassword}>
          {mode === "signUp" && (
            <>
              <div className="auth-form-grid">
                <label>
                  Nombre
                  <input
                    name="firstName"
                    type="text"
                    value={profileFields.firstName}
                    onChange={(event) => updateProfileField("firstName", onlySpanishLetters(event.target.value).slice(0, 15))}
                    placeholder="Pedro"
                    autoComplete="given-name"
                    maxLength={15}
                    required
                  />
                </label>
                <label>
                  Apellido
                  <input
                    name="lastName"
                    type="text"
                    value={profileFields.lastName}
                    onChange={(event) => updateProfileField("lastName", onlySpanishLetters(event.target.value).slice(0, 15))}
                    placeholder="Pérez"
                    autoComplete="family-name"
                    maxLength={15}
                    required
                  />
                </label>
              </div>
              <div className="auth-form-grid">
                <label>
                  Cédula venezolana
                  <input
                    name="nationalId"
                    type="text"
                    inputMode="numeric"
                    value={profileFields.nationalId}
                    onChange={(event) => updateProfileField("nationalId", onlyDigits(event.target.value).slice(0, 9))}
                    placeholder="12345678"
                    autoComplete="off"
                    maxLength={9}
                    required
                  />
                </label>
                <label>
                  Teléfono venezolano
                  <input
                    name="phone"
                    type="tel"
                    inputMode="numeric"
                    value={profileFields.phone}
                    onChange={(event) => updateProfileField("phone", onlyDigits(event.target.value).slice(0, 11))}
                    placeholder="04121234567"
                    autoComplete="tel"
                    maxLength={11}
                    required
                  />
                </label>
              </div>
              <fieldset className="auth-careers">
                <legend>Carrera(s) que estudias</legend>
                <div>
                  {CAREER_OPTIONS.map((career) => (
                    <label key={career.id}>
                      <input name="careers" type="checkbox" value={career.id} />
                      <span>{career.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}
          <label>
            Correo
            <input
              name="email"
              type="email"
              placeholder="tu@email.com"
              value={authFields.email}
              onChange={(event) => updateAuthField("email", event.target.value)}
              required
            />
          </label>

          {mode !== "forgotPassword" && (
            <label>
              Contraseña
              <input
                name="password"
                type="password"
                minLength={8}
                placeholder="Mínimo 8 caracteres"
                value={authFields.password}
                onChange={(event) => updateAuthField("password", event.target.value)}
                required
              />
            </label>
          )}

          {mode === "signUp" && (
            <label>
              Confirmar contraseña
              <input
                name="confirmPassword"
                type="password"
                minLength={8}
                placeholder="Repite tu contraseña"
                value={authFields.confirmPassword}
                onChange={(event) => updateAuthField("confirmPassword", event.target.value)}
                required
              />
            </label>
          )}

          {mode === "forgotPassword" && (
            <>
              <label>
                Cédula venezolana
                <input
                  name="resetNationalId"
                  type="text"
                  inputMode="numeric"
                  value={authFields.resetNationalId}
                  onChange={(event) => updateAuthField("resetNationalId", onlyDigits(event.target.value).slice(0, 9))}
                  placeholder="12345678"
                  autoComplete="off"
                  maxLength={9}
                  required
                />
              </label>
              <label>
                Nueva contraseña
                <input
                  name="resetPassword"
                  type="password"
                  minLength={8}
                  placeholder="Mínimo 8 caracteres"
                  value={authFields.resetPassword}
                  onChange={(event) => updateAuthField("resetPassword", event.target.value)}
                  required
                />
              </label>
              <label>
                Confirmar nueva contraseña
                <input
                  name="resetConfirmPassword"
                  type="password"
                  minLength={8}
                  placeholder="Repite tu nueva contraseña"
                  value={authFields.resetConfirmPassword}
                  onChange={(event) => updateAuthField("resetConfirmPassword", event.target.value)}
                  required
                />
              </label>
            </>
          )}

          <button className="primary-action form-submit" type="submit" disabled={submitting}>
            {submitting ? "Procesando..." : mode === "signIn" ? "Entrar" : mode === "signUp" ? "Registrarme" : "Actualizar contraseña"}
          </button>
        </form>

        <div className="auth-actions-stack">
          {mode === "signIn" && (
            <button
              className="quiet-button auth-forgot"
              type="button"
              disabled={submitting}
              onClick={() => switchMode("forgotPassword")}
            >
              Olvidé mi contraseña
            </button>
          )}
          <button
            className="quiet-button auth-mode"
            type="button"
            disabled={submitting}
            onClick={() => switchMode(mode === "signUp" ? "signIn" : "signUp")}
          >
            {mode === "signUp" ? "Ya tengo cuenta" : "Crear cuenta con correo"}
          </button>
          {mode === "forgotPassword" && (
            <button
              className="quiet-button auth-mode"
              type="button"
              disabled={submitting}
              onClick={() => switchMode("signIn")}
            >
              Volver al inicio de sesión
            </button>
          )}
        </div>

        {notice && <p className="auth-notice">{notice}</p>}
        {error && <p className="auth-error">{error}</p>}
      </section>
    </main>
  );

  function updateProfileField(field, value) {
    setProfileFields((current) => ({ ...current, [field]: value }));
  }

  function updateAuthField(field, value) {
    setAuthFields((current) => ({ ...current, [field]: value }));
  }

  function switchMode(nextMode) {
    setError("");
    setNotice("");
    setMode(nextMode);
  }
}

const USERS_KEY = "synapse-academia-local-users-v1";

function readUsers() {
  try {
    return JSON.parse(window.localStorage.getItem(USERS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeUsers(users) {
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function createLocalAccount(email, password, profile) {
  if (!email) throw new Error("Escribe un correo válido.");
  validateProfile(profile);
  if (password.length < 8) throw new Error("La contraseña debe tener mínimo 8 caracteres.");
  const users = readUsers();
  if (users[email]) throw new Error("Ya existe una cuenta con ese correo.");
  const user = { email, createdAt: Date.now(), password, ...profile };
  users[email] = user;
  writeUsers(users);
  return publicUser(user);
}

function signInLocalAccount(email, password) {
  const users = readUsers();
  const user = users[email];
  if (!user || user.password !== password) {
    throw new Error("Correo o contraseña incorrectos.");
  }
  return publicUser(user);
}

function resetLocalPassword(email, nationalId, nextPassword, recoveredProfile = null) {
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  if (!normalizedEmail) throw new Error("Escribe un correo válido.");
  if (nextPassword.length < 8) throw new Error("La contraseña debe tener mínimo 8 caracteres.");
  const normalizedNationalId = normalizeNationalId(nationalId);
  if (!/^\d{6,9}$/.test(normalizedNationalId)) {
    throw new Error("La cédula debe ser venezolana y contener entre 6 y 9 números.");
  }

  const users = readUsers();
  const localUser = users[normalizedEmail];
  const baseUser = localUser ?? recoveredProfile;
  if (!baseUser) throw new Error("No encontramos una cuenta con ese correo.");
  if (normalizeNationalId(baseUser.nationalId) !== normalizedNationalId) {
    throw new Error("La cédula no coincide con la cuenta registrada.");
  }

  users[normalizedEmail] = {
    ...baseUser,
    email: normalizedEmail,
    password: nextPassword,
    updatedAt: Date.now(),
  };
  writeUsers(users);
}

function readProfileForm(formData) {
  return {
    firstName: normalizePersonName(formData.get("firstName")),
    lastName: normalizePersonName(formData.get("lastName")),
    nationalId: normalizeNationalId(formData.get("nationalId")),
    phone: normalizeVenezuelanPhone(formData.get("phone")),
    careers: formData.getAll("careers").map(String),
  };
}

function validateProfile(profile) {
  if (!isSpanishPersonName(profile.firstName)) throw new Error("El nombre solo debe contener letras y tener máximo 15 caracteres.");
  if (!isSpanishPersonName(profile.lastName)) throw new Error("El apellido solo debe contener letras y tener máximo 15 caracteres.");
  if (!/^\d{6,9}$/.test(profile.nationalId)) throw new Error("La cédula debe ser venezolana y contener entre 6 y 9 números.");
  if (!/^0(2\d{2}|4(12|14|16|24|26))\d{7}$/.test(profile.phone)) throw new Error("El teléfono debe ser venezolano. Ejemplo: 04121234567 o 02121234567.");
  if (!profile.careers.length) throw new Error("Selecciona al menos una carrera.");
}

function isSpanishPersonName(value) {
  return /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,15}$/.test(value);
}

function normalizePersonName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeNationalId(value) {
  return onlyDigits(value).slice(0, 9);
}

function normalizeVenezuelanPhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.slice(0, 11);
}

function publicUser(user) {
  const { password, ...safeUser } = user;
  return safeUser;
}

function onlySpanishLetters(value) {
  return String(value ?? "").replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
}

function onlyDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}
