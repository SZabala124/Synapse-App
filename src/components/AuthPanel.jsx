import { useEffect, useState } from "react";
import logoUrl from "../../Synapse.svg";

const CAREER_OPTIONS = [
  { id: "sistemas", name: "Ingeniería de Sistemas" },
  { id: "civil", name: "Ingeniería Civil" },
  { id: "mecanica", name: "Ingeniería Mecánica" },
];

export function AuthPanel({ initialMode = "signIn", onBack, onAuthSuccess }) {
  const [mode, setMode] = useState(initialMode);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [profileFields, setProfileFields] = useState({
    firstName: "",
    lastName: "",
    nationalId: "",
    phone: "",
  });

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
    formData.set("flow", mode);
    formData.delete("confirmPassword");
    try {
      setSubmitting(true);
      const email = String(formData.get("email")).trim().toLowerCase();
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
        <h1>{mode === "signIn" ? "Inicia sesión" : "Crea tu cuenta"}</h1>
        <p>Accede con correo y contraseña. Google lo dejamos para una siguiente etapa.</p>

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
            <input name="email" type="email" placeholder="tu@email.com" required />
          </label>
          <label>
            Contraseña
            <input name="password" type="password" minLength={8} placeholder="Mínimo 8 caracteres" required />
          </label>
          {mode === "signUp" && (
            <label>
              Confirmar contraseña
              <input name="confirmPassword" type="password" minLength={8} placeholder="Repite tu contraseña" required />
            </label>
          )}
          <button className="primary-action form-submit" type="submit" disabled={submitting}>
            {submitting ? "Procesando..." : mode === "signIn" ? "Entrar" : "Registrarme"}
          </button>
        </form>

        <button
          className="quiet-button auth-mode"
          type="button"
          disabled={submitting}
          onClick={() => {
            setError("");
            setMode(mode === "signIn" ? "signUp" : "signIn");
          }}
        >
          {mode === "signIn" ? "Crear cuenta con correo" : "Ya tengo cuenta"}
        </button>

        {error && <p className="auth-error">{error}</p>}
      </section>
    </main>
  );

  function updateProfileField(field, value) {
    setProfileFields((current) => ({ ...current, [field]: value }));
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
