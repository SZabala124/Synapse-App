import { useEffect, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import logoUrl from "../../Synapse.svg";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { SignupTermsModal } from "./LegalDocuments";

const CAREER_OPTIONS = [
  { id: "sistemas", name: "Ingeniería de Sistemas" },
  { id: "civil", name: "Ingeniería Civil" },
  { id: "mecanica", name: "Ingeniería Mecánica" },
  { id: "electrica", name: "Ingeniería Eléctrica" },
  { id: "produccion", name: "Ingeniería de Producción" },
  { id: "quimica", name: "Ingeniería Química" },
  { id: "psicologia", name: "Psicología" },
  { id: "idiomas", name: "Idiomas Modernos" },
  { id: "estudios-internacionales", name: "Estudios Internacionales" },
  { id: "economia-empresarial", name: "Economía Empresarial" },
  { id: "contaduria-publica", name: "Contaduría Pública" },
];

const RECOVERY_QUESTIONS = [
  { id: "first_pet", text: "¿Cómo se llamaba tu primera mascota?" },
  { id: "first_car", text: "¿Cuál es la marca de tu carro favorito?" },
  { id: "birth_city", text: "¿En qué ciudad naciste?" },
  { id: "childhood_nickname", text: "¿Cuál era tu apodo de infancia?" },
  { id: "first_school", text: "¿Cómo se llamaba tu primera escuela?" },
  { id: "favorite_food", text: "¿Cuál era tu comida favorita de niño?" },
];

function AppSelect({ value, onChange, options, name, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex((option) => option.value === value)));
  const rootRef = useRef(null);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return undefined;
    function closeOnOutsideClick(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  function handleKeyDown(event) {
    if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) event.preventDefault();
    if (event.key === "Escape") { setOpen(false); return; }
    if (event.key === "ArrowDown") {
      if (!open) setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      if (!open) setOpen(true);
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Home") setActiveIndex(0);
    else if (event.key === "End") setActiveIndex(options.length - 1);
    else if ((event.key === "Enter" || event.key === " ") && open) {
      onChange(options[activeIndex].value);
      setOpen(false);
    }
  }

  return (
    <div className="auth-select" ref={rootRef}>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="auth-select-trigger"
        onClick={() => { setActiveIndex(selectedIndex); setOpen((current) => !current); }}
        onKeyDown={handleKeyDown}
        type="button"
      >
        <span>{selected?.label}</span><span className="auth-select-chevron" aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="auth-select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option, index) => (
            <button
              aria-selected={option.value === value}
              className={`auth-select-option${index === activeIndex ? " is-active" : ""}`}
              key={option.value}
              onClick={() => { onChange(option.value); setOpen(false); }}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AuthPanel({ initialMode = "signIn", initialError = "", onBack, onAuthSuccess, onSignupStarted, onSignupFailed, convexEnabled = false }) {
  const [mode, setMode] = useState(initialMode);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [submitAfterTerms, setSubmitAfterTerms] = useState(false);
  const formRef = useRef(null);
  const [selectedCareers, setSelectedCareers] = useState([]);
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
    resetPassword: "",
    resetConfirmPassword: "",
  });
  const [recoveryQuestion, setRecoveryQuestion] = useState("first_pet");
  const [recoveryAnswer, setRecoveryAnswer] = useState("");
  const [recoveryMethod, setRecoveryMethod] = useState("code");
  const [recoveryEvidence, setRecoveryEvidence] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryPasswordConfirmation, setRecoveryPasswordConfirmation] = useState("");
  const [recoveryCodeToShow, setRecoveryCodeToShow] = useState("");
  const [recoveryCodePurpose, setRecoveryCodePurpose] = useState("");
  const [signupUserToContinue, setSignupUserToContinue] = useState(null);
  const [signupRecoverySetup, setSignupRecoverySetup] = useState(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const recordLogin = useMutation(api.loginLimits.record);
  const ensureProfile = useMutation(api.users.ensureProfile);
  const initializeRecovery = useAction(api.recoveryCredentials.initializeForCurrentUser);
  const resetWithRecoveryCredential = useAction(api.recoveryCredentials.resetPassword);

  useEffect(() => {
    setMode(initialMode);
    setError(initialError);
    setTermsAccepted(false);
    setTermsOpen(false);
  }, [initialMode, initialError]);

  useEffect(() => {
    // Remove credentials left by versions that stored local accounts in clear text.
    window.localStorage.removeItem("synapse-academia-local-users-v1");
  }, []);

  useEffect(() => {
    if (!termsAccepted || !submitAfterTerms) return;
    setSubmitAfterTerms(false);
    formRef.current?.requestSubmit();
  }, [submitAfterTerms, termsAccepted]);

  async function handlePassword(event) {
    event.preventDefault();
    if (submitting) return;
    setError("");
    const formData = new FormData(event.currentTarget);
    if (mode === "signUp" && formData.get("password") !== formData.get("confirmPassword")) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (mode === "signUp" && !isUnimetEmail(formData.get("email"))) {
      setError("Para crear una cuenta nueva necesitas usar tu correo institucional @correo.unimet.edu.ve.");
      return;
    }
    if (mode === "signUp" && !convexEnabled) {
      setError("No se puede crear la cuenta porque el servicio seguro de recuperación no está disponible.");
      return;
    }
    if (mode === "signUp" && !String(formData.get("recoveryAnswer") ?? "").trim()) {
      setError("Elige una pregunta y escribe una respuesta para proteger la recuperación de tu cuenta.");
      return;
    }
    if (mode === "signUp" && !termsAccepted) {
      setTermsOpen(true);
      return;
    }
    if (mode === "recoveryPassword" && formData.get("resetPassword") !== formData.get("resetConfirmPassword")) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    formData.set("flow", mode);
    formData.delete("confirmPassword");
    try {
      setSubmitting(true);
      const email = String(formData.get("email") ?? "").trim().toLowerCase();
      if (mode === "recoveryPassword") {
        const nextPassword = String(formData.get("resetPassword"));
        let { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (!sessionData.session && sessionError) throw sessionError;
        if (!sessionData.session) {
          const hashParams = new URLSearchParams(window.location.hash.slice(1));
          const queryParams = new URLSearchParams(window.location.search);
          const tokenHash = hashParams.get("token_hash") || queryParams.get("token_hash");
          const tokenType = hashParams.get("type") || queryParams.get("type");
          if (tokenHash && tokenType === "recovery") {
            const { data, error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
            if (verifyError) throw verifyError;
            sessionData = data;
          }
        }
        if (!sessionData.session) throw new Error("No se pudo validar el enlace. Solicita un enlace nuevo e inténtalo otra vez.");
        const { error: updateError } = await supabase.auth.updateUser({ password: nextPassword });
        if (updateError) throw updateError;
        await supabase.auth.signOut({ scope: "local" });
        const cleanUrl = new URL(window.location.href);
        ["code", "type", "token_hash", "error", "error_code", "error_description"].forEach((key) => cleanUrl.searchParams.delete(key));
        cleanUrl.hash = "";
        window.history.replaceState({}, document.title, `${cleanUrl.pathname}${cleanUrl.search}`);
        setMode("signIn");
        setNotice("Contraseña actualizada. Inicia sesión con tu nueva contraseña.");
        return;
      }
      const password = String(formData.get("password"));
      if (!isSupabaseConfigured || !supabase) {
        throw new Error("El acceso centralizado todavía no está configurado.");
      }
      let user;
      if (mode === "signUp") {
        const profile = readProfileForm(formData);
        validateProfile(profile);
        onSignupStarted?.();
        let signUpResponse;
        try {
          signUpResponse = await supabase.auth.signUp({ email, password });
        } catch (signUpError) {
          onSignupFailed?.();
          throw signUpError;
        }
        const { data, error: signUpError } = signUpResponse;
        if (signUpError) {
          onSignupFailed?.();
          throw signUpError;
        }
        if (!data.session) {
          onSignupFailed?.();
          throw new Error("Supabase todavía requiere confirmar el correo. Desactiva Confirm Email antes de crear cuentas.");
        }
        user = { email: data.user.email.toLowerCase(), createdAt: Date.now(), ...profile };
        const recoverySetup = {
          user,
          profile,
          question: String(formData.get("recoveryQuestion")),
          answer: String(formData.get("recoveryAnswer")),
        };
        setSignupRecoverySetup(recoverySetup);
        setMode("setupRecovery");
        await finishSignupRecovery(recoverySetup);
        return;
      } else {
        user = await authenticateWithPassword(email, password);
        const dailyLogin = await recordLogin({ email: user.email });
        console.info(
          dailyLogin.isExempt
            ? `[Synapse acceso] ${user.email}: administrador, sin límite diario de inicios de sesión.`
            : `[Synapse acceso] ${user.email}: ${dailyLogin.count}/${dailyLogin.limit} inicios de sesión hoy.`,
        );
      }
      onAuthSuccess(user);
    } catch (authError) {
      setError(readableAuthError(authError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRecovery(event) {
    event.preventDefault();
    if (submitting) return;
    setError("");
    const email = String(recoveryEmail).trim().toLowerCase();
    const evidence = String(recoveryEvidence).trim();
    if (recoveryPassword !== recoveryPasswordConfirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (recoveryMethod === "code" && !/^[a-f0-9-]{32,39}$/i.test(evidence.replace(/\s/g, ""))) {
      setError("Escribe la clave aleatoria que guardaste al crear tu cuenta.");
      return;
    }
    if (recoveryMethod === "question" && (!evidence || evidence.length > 20)) {
      setError("Escribe la respuesta de seguridad (máximo 20 caracteres).");
      return;
    }
    setSubmitting(true);
    try {
      const result = await resetWithRecoveryCredential({
        email,
        method: recoveryMethod,
        recoveryCode: recoveryMethod === "code" ? evidence : undefined,
        question: recoveryMethod === "question" ? recoveryQuestion : undefined,
        answer: recoveryMethod === "question" ? evidence : undefined,
        newPassword: recoveryPassword,
      });
      setRecoveryCodeToShow(result.recoveryCode);
      setRecoveryCodePurpose("reset");
      setCodeCopied(false);
      setRecoveryEvidence("");
      setRecoveryPassword("");
      setRecoveryPasswordConfirmation("");
      setMode("showRecoveryCode");
    } catch (recoveryError) {
      setError(readableAuthError(recoveryError));
    } finally {
      setSubmitting(false);
    }
  }

  async function finishSignupRecovery(recoverySetup) {
    await ensureSignupProfile(recoverySetup);
    const recovery = await initializeRecovery({
      question: recoverySetup.question,
      answer: recoverySetup.answer,
    });
    setSignupUserToContinue(recoverySetup.user);
    setRecoveryQuestion(recoverySetup.question);
    setRecoveryAnswer("");
    setAuthFields((current) => ({ ...current, password: "", confirmPassword: "" }));
    setRecoveryCodeToShow(recovery.recoveryCode);
    setRecoveryCodePurpose("signup");
    setCodeCopied(false);
    setMode("showRecoveryCode");
    setError("");
  }

  async function ensureSignupProfile(recoverySetup) {
    const args = { email: recoverySetup.user.email, ...recoverySetup.profile };
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        return await ensureProfile(args);
      } catch (profileError) {
        const authNotReady = /iniciar sesión|unauthenticated|not authenticated/i.test(String(profileError?.message ?? ""));
        if (!authNotReady || attempt === 5) throw profileError;
        await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
  }

  async function retrySignupRecovery() {
    if (!signupRecoverySetup || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await finishSignupRecovery(signupRecoverySetup);
    } catch (recoveryError) {
      setError(readableAuthError(recoveryError));
    } finally {
      setSubmitting(false);
    }
  }

  async function copyRecoveryCode() {
    try {
      await navigator.clipboard.writeText(recoveryCodeToShow);
      setCodeCopied(true);
    } catch {
      setCodeCopied(false);
    }
  }

  function finishRecoveryCode() {
    const purpose = recoveryCodePurpose;
    setRecoveryCodeToShow("");
    setRecoveryCodePurpose("");
    if (purpose === "signup" && signupUserToContinue) {
      onAuthSuccess(signupUserToContinue);
      setSignupUserToContinue(null);
      return;
    }
    setMode("signIn");
    setNotice("Contraseña actualizada. Inicia sesión con tu nueva contraseña y guarda la nueva clave de recuperación.");
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        {onBack && !["showRecoveryCode", "setupRecovery"].includes(mode) && (
          <button className="auth-back-button" type="button" onClick={onBack} aria-label="Volver">
            ←
          </button>
        )}
        <div className="auth-logo-lockup">
          <img src={logoUrl} alt="" aria-hidden="true" />
          <span>Synapse Academia</span>
        </div>
        <h1>{mode === "signIn" ? "Inicia sesión" : mode === "signUp" ? "Crea tu cuenta" : mode === "recoveryPassword" ? "Define tu nueva contraseña" : mode === "setupRecovery" ? "Configurando recuperación" : mode === "showRecoveryCode" ? recoveryCodePurpose === "signup" ? "Guarda tu clave de recuperación" : "Contraseña restablecida" : "Recupera tu contraseña"}</h1>
        <p>
          {mode === "forgotPassword"
            ? "No enviaremos correos. Restablece tu contraseña con la clave aleatoria que guardaste o con la respuesta de seguridad que elegiste al crear tu cuenta. Si no tienes ninguna, contacta al administrador."
            : mode === "recoveryPassword"
              ? "Al enviar el formulario verificaremos el enlace y cambiaremos la contraseña."
            : mode === "showRecoveryCode"
              ? recoveryCodePurpose === "signup"
                  ? "Copia y guarda esta clave en un lugar seguro. No podrás volver a consultarla desde la aplicación. Después de guardarla, continuarás a la selección de materias."
                  : "La contraseña se cambió. Guarda esta nueva clave; la anterior ya no sirve."
                : mode === "setupRecovery"
                  ? "La cuenta ya se creó. Estamos vinculando tu clave y pregunta de recuperación antes de continuar."
                : "Accede con correo y contraseña. Puedes iniciar sesión un máximo de 3 veces al día."}
        </p>

        {mode === "setupRecovery" ? (
          <div className="auth-recovery-code-panel">
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="primary-action form-submit" type="button" disabled={submitting || !signupRecoverySetup} onClick={retrySignupRecovery}>
              {submitting ? "Preparando…" : "Reintentar configuración segura"}
            </button>
          </div>
        ) : mode === "showRecoveryCode" ? (
          <div className="auth-recovery-code-panel">
            <label htmlFor="new-recovery-code">Clave aleatoria de recuperación</label>
            <code id="new-recovery-code" className="auth-recovery-code">{recoveryCodeToShow}</code>
            <button className="secondary-action" type="button" onClick={copyRecoveryCode}>
              {codeCopied ? "Clave copiada" : "Copiar clave"}
            </button>
            {recoveryCodePurpose === "signup" && (
              <p className="auth-recovery-warning">Tu pregunta elegida: {RECOVERY_QUESTIONS.find((item) => item.id === recoveryQuestion)?.text} Recuerda también la respuesta exacta que escribiste.</p>
            )}
            <button className="primary-action form-submit" type="button" onClick={finishRecoveryCode}>
              {recoveryCodePurpose === "signup" ? "Ya la guardé, continuar" : "Ya guardé la nueva clave"}
            </button>
          </div>
        ) : mode === "forgotPassword" ? (
          <form className="auth-form" onSubmit={handleRecovery}>
            <label>Correo de la cuenta
              <input type="email" autoComplete="email" value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} required />
            </label>
            <label>Cómo quieres verificar tu cuenta
              <AppSelect ariaLabel="Cómo quieres verificar tu cuenta" value={recoveryMethod} onChange={(nextValue) => { setRecoveryMethod(nextValue); setRecoveryEvidence(""); }} options={[{ value: "code", label: "Clave aleatoria" }, { value: "question", label: "Pregunta de seguridad" }]} />
            </label>
            {recoveryMethod === "code" ? (
              <label>Clave aleatoria
                <input type="text" autoComplete="off" spellCheck="false" maxLength={39} placeholder="ABCD-1234-…" value={recoveryEvidence} onChange={(event) => setRecoveryEvidence(event.target.value.replace(/[^a-f0-9-]/gi, "").slice(0, 39))} required />
              </label>
            ) : (
              <>
                <label>La pregunta que elegiste al registrarte
                  <AppSelect ariaLabel="La pregunta que elegiste al registrarte" value={recoveryQuestion} onChange={setRecoveryQuestion} options={RECOVERY_QUESTIONS.map((question) => ({ value: question.id, label: question.text }))} />
                </label>
                <label>Tu respuesta
                  <input type="text" autoComplete="off" maxLength={20} value={recoveryEvidence} onChange={(event) => setRecoveryEvidence(event.target.value.slice(0, 20))} required />
                </label>
              </>
            )}
            <label>Nueva contraseña
              <input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={recoveryPassword} onChange={(event) => setRecoveryPassword(event.target.value)} required />
            </label>
            <label>Confirmar nueva contraseña
              <input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={recoveryPasswordConfirmation} onChange={(event) => setRecoveryPasswordConfirmation(event.target.value)} required />
            </label>
            <p className="auth-recovery-warning">La clave aleatoria es la opción más segura. Guárdala en un lugar privado y seguro para poder recuperar tu cuenta. Contacta al 04242327486.</p>
            <button className="primary-action form-submit" type="submit" disabled={submitting}>
              {submitting ? "Verificando…" : "Verificar y cambiar contraseña"}
            </button>
          </form>
        ) : <form ref={formRef} className="auth-form" onSubmit={handlePassword}>
          <>
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
                  Cédula o Carnet Universitario
                  <input
                    name="nationalId"
                    type="text"
                    inputMode="numeric"
                    value={profileFields.nationalId}
                    onChange={(event) => updateProfileField("nationalId", onlyDigits(event.target.value).slice(0, 12))}
                    placeholder="123456789012"
                    autoComplete="off"
                    maxLength={12}
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
                      <input name="careers" type="checkbox" value={career.id}
                        checked={selectedCareers.includes(career.id)}
                        disabled={selectedCareers.length >= 2 && !selectedCareers.includes(career.id)}
                        onChange={(event) => setSelectedCareers((current) => event.target.checked ? [...current, career.id].slice(0, 2) : current.filter((id) => id !== career.id))}
                      />
                      <span>{career.name}</span>
                    </label>
                  ))}
                </div>
                <small className="career-limit-note">Solo puedes tener 2 carreras a la vez.</small>
              </fieldset>
              <label>Pregunta de seguridad
                <AppSelect ariaLabel="Pregunta de seguridad" name="recoveryQuestion" value={recoveryQuestion} onChange={setRecoveryQuestion} options={RECOVERY_QUESTIONS.map((question) => ({ value: question.id, label: question.text }))} />
              </label>
              <label>Respuesta de seguridad (máximo 20 caracteres)
                <input name="recoveryAnswer" type="text" autoComplete="off" maxLength={20} value={recoveryAnswer} onChange={(event) => setRecoveryAnswer(event.target.value.slice(0, 20))} required />
                <small className="auth-email-note">También puedes recuperar la cuenta con la clave aleatoria. La respuesta no distingue mayúsculas ni espacios repetidos.</small>
              </label>
            </>
          )}
          {mode !== "recoveryPassword" && <label>
            Correo
            <input
              name="email"
              type="email"
              placeholder="tu@email.com"
              value={authFields.email}
              onChange={(event) => updateAuthField("email", event.target.value)}
              required
            />
            {mode === "signUp" && (
              <small className="auth-email-note">Las cuentas nuevas requieren un correo UNIMET terminado en @correo.unimet.edu.ve.</small>
            )}
          </label>}

          {mode !== "forgotPassword" && mode !== "recoveryPassword" && (
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

          {mode === "recoveryPassword" && (
            <>
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
          </>

          <button className="primary-action form-submit" type="submit" disabled={submitting}>
            {submitting ? "Procesando..." : mode === "signIn" ? "Entrar" : mode === "signUp" ? "Registrarme" : "Actualizar contraseña"}
          </button>
        </form>}

        <div className="auth-actions-stack">
          {mode === "signIn" && (
            <button
              className="quiet-button auth-forgot"
              type="button"
              disabled={submitting}
              onClick={() => { setRecoveryEmail(authFields.email); switchMode("forgotPassword"); }}
            >
              Olvidé mi contraseña
            </button>
          )}
          {!['forgotPassword', 'recoveryPassword', 'showRecoveryCode', 'setupRecovery'].includes(mode) && (
            <button
              className="quiet-button auth-mode"
              type="button"
              disabled={submitting}
              onClick={() => switchMode(mode === "signUp" ? "signIn" : "signUp")}
            >
              {mode === "signUp" ? "Ya tengo cuenta" : "Crear cuenta con correo"}
            </button>
          )}
          {(mode === "forgotPassword" || mode === "recoveryPassword") && (
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
      {termsOpen && (
        <SignupTermsModal
          onClose={() => setTermsOpen(false)}
          onAccept={() => {
            setTermsAccepted(true);
            setTermsOpen(false);
            setSubmitAfterTerms(true);
          }}
        />
      )}
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
    setTermsAccepted(false);
    setTermsOpen(false);
    setMode(nextMode);
  }

  async function authenticateWithPassword(email, password) {
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (!signInError && data.user?.email) {
      return { email: data.user.email.toLowerCase(), createdAt: Date.now() };
    }
    if (isInvalidCredentialError(signInError)) throw new Error("Correo o contraseña incorrectos.");
    throw signInError;
  }
}

function isUnimetEmail(value) {
  return /^[^\s@]+@correo\.unimet\.edu\.ve$/i.test(String(value ?? "").trim());
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
  if (!isSpanishPersonName(profile.firstName)) throw new Error("El nombre debe contener al menos 2 letras; admite espacios y un máximo de 15 caracteres.");
  if (!isSpanishPersonName(profile.lastName)) throw new Error("El apellido debe contener al menos 2 letras; admite espacios y un máximo de 15 caracteres.");
  if (!/^\d{6,12}$/.test(profile.nationalId)) throw new Error("La cédula o el carnet universitario debe contener entre 6 y 12 números.");
  if (!/^0(2\d{2}|4(12|14|16|24|26))\d{7}$/.test(profile.phone)) throw new Error("El teléfono debe ser venezolano. Ejemplo: 04121234567 o 02121234567.");
  if (!profile.careers.length) throw new Error("Selecciona al menos una carrera.");
  if (new Set(profile.careers).size > 2) throw new Error("Solo puedes seleccionar hasta 2 carreras a la vez.");
}

function isSpanishPersonName(value) {
  return /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]{2,15}$/.test(value.trim()) && value.replace(/ /g, "").length >= 2;
}

function normalizePersonName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeNationalId(value) {
  return onlyDigits(value).slice(0, 12);
}

function normalizeVenezuelanPhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.slice(0, 11);
}

function onlySpanishLetters(value) {
  return String(value ?? "").replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]/g, "");
}

function onlyDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function isInvalidCredentialError(error) {
  return /invalid login credentials|invalid credentials/i.test(String(error?.message ?? ""));
}

function readableAuthError(error) {
  const message = String(error?.message ?? "");
  const serverMessage = message.match(/Uncaught Error:\s*([\s\S]*?)(?:\s+at handler|\s+Called by client|$)/i)?.[1]?.trim();
  return serverMessage || message || "No se pudo completar el acceso.";
}
