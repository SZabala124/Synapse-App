import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { activities, flowPeriods, subjects } from "./data/demoData";
import { loadJson, saveJson } from "./utils/localStore";
import { readConvexCache, writeConvexCache } from "./utils/convexCache";
import { useCachedConvexQuery } from "./hooks/useCachedConvexQuery";
import { useMaterialCatalog } from "./hooks/useMaterialCatalog";
import { deleteMaterialFile, uploadMaterialImage, uploadMaterialPdf } from "./services/materialFiles";
import { AppShell } from "./components/AppShell";
import { AuthPanel } from "./components/AuthPanel";
import { LandingView } from "./views/LandingView";
import { FlowView } from "./views/FlowView";
import { MaterialsView } from "./views/MaterialsView";
import { ProfileView } from "./views/ProfileView";
import { PublicLanding } from "./views/PublicLanding";
import { ToolsView } from "./views/ToolsView";
import { CommentsView } from "./views/CommentsView";
import { PlansView } from "./views/PlansView";
import { PaymentsView } from "./views/PaymentsView";
import { UsersView } from "./views/UsersView";
import logoUrl from "../Synapse.svg";

const STORAGE_KEY = "synapse-academia-react-cache-v2";
const SESSION_KEY = "synapse-academia-local-session-v1";
const LOCAL_USERS_KEY = "synapse-academia-local-users-v1";
const THEME_KEY = "synapse-academia-theme-v1";
const ADMIN_EMAIL_FALLBACKS = (import.meta.env.VITE_ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const defaultState = {
  flowStatuses: {},
  materials: [],
};

export default function App({ convexEnabled = false }) {
  const [authRequested, setAuthRequested] = useState(false);
  const [authMode, setAuthMode] = useState("signIn");
  const [currentUser, setCurrentUser] = useState(() => loadJson(SESSION_KEY, null));
  const [loadingUser, setLoadingUser] = useState(null);
  const [theme, setTheme] = useState(() => {
    const savedTheme = window.localStorage.getItem(THEME_KEY);
    if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  function openAuth(mode) {
    setAuthMode(mode);
    setAuthRequested(true);
  }

  function handleAuthSuccess(user) {
    saveJson(SESSION_KEY, user);
    setAuthRequested(false);
    setLoadingUser(user);
    window.setTimeout(() => {
      setCurrentUser(user);
      setLoadingUser(null);
    }, 1400);
  }

  function handleSignOut() {
    window.localStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
    setLoadingUser(null);
    setAuthRequested(false);
  }

  if (loadingUser) {
    return <AppLoader />;
  }

  if (currentUser) {
    return (
      <AuthenticatedApp
        currentUser={currentUser}
        convexEnabled={convexEnabled}
        theme={theme}
        onThemeChange={setTheme}
        onUserUpdate={setCurrentUser}
        onSignOut={handleSignOut}
      />
    );
  }

  return (
    <>
      {authRequested ? (
        <AuthPanel initialMode={authMode} onBack={() => setAuthRequested(false)} onAuthSuccess={handleAuthSuccess} />
      ) : (
        <PublicLanding onAuthClick={openAuth} />
      )}
    </>
  );
}

function AppLoader() {
  return (
    <main className="auth-screen app-loader-screen" aria-live="polite" aria-busy="true">
      <section className="auth-card app-loader-card">
        <div className="loader-logo-mark">
          <img src={logoUrl} alt="" aria-hidden="true" />
          <span className="loader-orbit" />
        </div>
        <p className="eyebrow">Synapse Academia</p>
        <h1>Preparando tu biblioteca</h1>
        <p>Cargando materiales, flujograma y preferencias locales.</p>
        <div className="loader-bar" aria-hidden="true">
          <span />
        </div>
      </section>
    </main>
  );
}

function AuthenticatedApp({ currentUser, convexEnabled, theme, onThemeChange, onUserUpdate, onSignOut }) {
  const [route, setRoute] = useState(() => window.location.hash.replace("#", "") || "landing");
  const [appState, setAppState] = useState(() => loadJson(STORAGE_KEY, defaultState));
  const [toast, setToast] = useState("");
  const [subjectSelectionOpen, setSubjectSelectionOpen] = useState(false);
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialFormat, setMaterialFormat] = useState("Todos");
  const [materialLevel, setMaterialLevel] = useState("Todos");
  const [materialSubject, setMaterialSubject] = useState("Todas");
  const [materialSort, setMaterialSort] = useState("Recientes");
  const [materialSavedOnly, setMaterialSavedOnly] = useState(false);
  const [toolSearch, setToolSearch] = useState("");
  const [toolSubject, setToolSubject] = useState("Todas");
  const [toolSort, setToolSort] = useState("Recientes");
  const [toolLimit, setToolLimit] = useState(6);
  const subjectSelection = useQuery(api.users.getSubjectSelection, convexEnabled ? { email: currentUser.email } : "skip");
  const entitlements = useQuery(api.users.getEntitlements, convexEnabled ? { email: currentUser.email } : "skip");
  const pendingPayment = useQuery(api.payments.myPending, convexEnabled ? { userEmail: currentUser.email } : "skip");
  const saveSubjectSelection = useMutation(api.users.saveSubjectSelection);
  const currentUserWithSubjectSelection = useMemo(() => ({
    ...currentUser,
    plan: entitlements?.plan ?? subjectSelection?.plan ?? currentUser.plan ?? "free",
    selectedSubjectCodes: subjectSelection?.selectedSubjectCodes ?? currentUser.selectedSubjectCodes ?? [],
  }), [currentUser, entitlements?.plan, subjectSelection?.plan, subjectSelection?.selectedSubjectCodes]);
  const isAdminForMaterialAccess = subjectSelection?.userType === "admin" || ADMIN_EMAIL_FALLBACKS.includes(currentUser.email.toLowerCase());
  const pendingAdminPaymentCount = useQuery(api.payments.pendingCount, convexEnabled && isAdminForMaterialAccess ? { adminEmail: currentUser.email } : "skip");
  const isBlockedUser = convexEnabled && (subjectSelection?.userType === "blocked" || entitlements?.userType === "blocked");
  const hasPaidPlan = ["pro", "excellence"].includes(currentUserWithSubjectSelection.plan);
  const hasSavedSubjectSelection = Boolean(
    (subjectSelection?.modalSeen || currentUser.subjectSelectionModalSeen) &&
    (currentUserWithSubjectSelection.selectedSubjectCodes ?? []).length > 0,
  );
  const canLoadMaterialData = !convexEnabled || isAdminForMaterialAccess || hasPaidPlan || hasSavedSubjectSelection;

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash.replace("#", "") || "landing");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    saveJson(STORAGE_KEY, appState);
  }, [appState]);

  useEffect(() => {
    setToolLimit(6);
  }, [toolSearch, toolSubject, toolSort]);

  function showToast(message) {
    setToast(message);
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(""), 2600);
  }

  useEffect(() => {
    if (!convexEnabled || !subjectSelection?.shouldShowModal) return;
    setSubjectSelectionOpen(true);
  }, [convexEnabled, subjectSelection?.shouldShowModal]);

  async function updateSubjectSelection(subjectCodes) {
    const updatedProfile = await saveSubjectSelection({ email: currentUser.email, subjectCodes });
    const nextUser = {
      ...currentUser,
      selectedSubjectCodes: updatedProfile?.selectedSubjectCodes ?? subjectCodes,
      subjectSelectionModalSeen: true,
      subjectSelectionEditsRemaining: updatedProfile?.subjectSelectionEditsRemaining,
      subjectSelectionPeriodEnd: updatedProfile?.subjectSelectionPeriodEnd,
    };
    saveJson(SESSION_KEY, nextUser);
    onUserUpdate(nextUser);
    setSubjectSelectionOpen(false);
    showToast("Materias del trimestre actualizadas.");
  }

  function addMaterial(material) {
    const newMaterial = {
      ...material,
      id: `mat-${Date.now()}`,
      saved: false,
      updated: new Date().toISOString().slice(0, 10),
    };
    setAppState((current) => ({
      ...current,
      materials: [newMaterial, ...(current.materials ?? [])],
    }));
    showToast("Recurso guardado localmente.");
  }

  function toggleMaterialSaved(material) {
    setAppState((current) => ({
      ...current,
      materials: (current.materials ?? []).map((item) => (item.id === material.id ? { ...item, saved: !item.saved } : item)),
    }));
  }

  function updateFlowStatus(code, status) {
    setAppState((current) => ({
      ...current,
      flowStatuses: { ...current.flowStatuses, [code]: status },
    }));
  }

  const loadMoreTools = useCallback(() => {
    setToolLimit((current) => current + 6);
  }, []);

  const allowedRoutes = [
    "landing",
    "career",
    "materials",
    "tools",
    "comments",
    "profile",
    ...(isAdminForMaterialAccess ? ["users", "payments"] : ["plans"]),
  ];
  const currentRoute = allowedRoutes.includes(route) ? route : (isAdminForMaterialAccess ? "users" : "landing");
  const activeSubjects = useMemo(() => subjects.filter((subject) => ["Cursando", "Planificada"].includes(subject.status)), []);
  const nextActivity = activities[0];
  const materials = filterMaterials(appState.materials ?? [], materialSearch, materialFormat, materialLevel, materialSubject);
  const visibleLocalMaterials = materialSavedOnly ? materials.filter((material) => material.saved) : materials;

  return (
    <>
      <canvas id="study-canvas" aria-hidden="true" />
      {convexEnabled && <ConvexUserProfileSync currentUser={currentUserWithSubjectSelection} />}
      {isBlockedUser ? (
        <BlockedAccountScreen onSignOut={onSignOut} />
      ) : (
      <>
      <AppShell
        currentRoute={currentRoute}
        theme={theme}
        onThemeChange={onThemeChange}
        isAdmin={isAdminForMaterialAccess}
        pendingPaymentCount={pendingAdminPaymentCount ?? 0}
      />
      <main id="view-root" className="view-root is-mounted" tabIndex="-1">
        {currentRoute === "landing" && (
          <LandingView activeSubjects={activeSubjects} materials={materials} nextActivity={nextActivity} activities={activities} />
        )}
        {currentRoute === "career" && (
          convexEnabled ? (
            <ConvexFlowSection
              currentUser={currentUserWithSubjectSelection}
              canLoadMaterials={canLoadMaterialData}
              onOpenMaterialInLibrary={(material, course) => {
                setMaterialSearch(material.title);
                setMaterialSubject(course?.code ?? materialSubjectIds(material)[0] ?? "Todas");
                window.location.hash = "materials";
              }}
            />
          ) : (
            <FlowView flowPeriods={flowPeriods} flowStatuses={appState.flowStatuses} onStatusChange={updateFlowStatus} />
          )
        )}
        {currentRoute === "materials" && (
          convexEnabled ? (
            <ConvexMaterialsSection
              currentUser={currentUserWithSubjectSelection}
              entitlements={entitlements}
              canLoadMaterials={canLoadMaterialData}
              search={materialSearch}
              format={materialFormat}
              level={materialLevel}
              subject={materialSubject}
              sort={materialSort}
              savedOnly={materialSavedOnly}
              onSearchChange={setMaterialSearch}
              onFormatChange={setMaterialFormat}
              onLevelChange={setMaterialLevel}
              onSubjectChange={setMaterialSubject}
              onSortChange={setMaterialSort}
              onSavedOnlyChange={setMaterialSavedOnly}
            />
          ) : (
            <MaterialsView
              materials={visibleLocalMaterials}
              subjects={subjects}
              remoteStatus="Biblioteca disponible sin conexion"
              search={materialSearch}
              format={materialFormat}
              level={materialLevel}
              subject={materialSubject}
              sort={materialSort}
              savedOnly={materialSavedOnly}
              onSearchChange={setMaterialSearch}
              onFormatChange={setMaterialFormat}
              onLevelChange={setMaterialLevel}
              onSubjectChange={setMaterialSubject}
              onSortChange={setMaterialSort}
              onSavedOnlyChange={setMaterialSavedOnly}
              onAddMaterial={null}
              onToggleSaved={null}
              countMaterials={appState.materials ?? []}
            />
          )
        )}
        {currentRoute === "tools" && (
          <ToolsView
            subjects={buildToolSubjectsForUser(
              currentUserWithSubjectSelection,
              subjectSelection?.userType === "admin" || ADMIN_EMAIL_FALLBACKS.includes(currentUser.email.toLowerCase()) || hasPaidPlan,
            )}
            currentPlan={currentUserWithSubjectSelection.plan}
            entitlements={entitlements}
            toolsLocked={convexEnabled && !isAdminForMaterialAccess && currentUserWithSubjectSelection.plan === "free"}
            userEmail={currentUser.email}
            search={toolSearch}
            subject={toolSubject}
            sort={toolSort}
            limit={toolLimit}
            onSearchChange={setToolSearch}
            onSubjectChange={setToolSubject}
            onSortChange={setToolSort}
            onLoadMore={loadMoreTools}
          />
        )}
        {currentRoute === "plans" && (
          <PlansView
            currentUser={currentUserWithSubjectSelection}
            currentPlan={currentUserWithSubjectSelection.plan}
            isAdmin={isAdminForMaterialAccess}
            pendingPayment={pendingPayment}
          />
        )}
        {currentRoute === "users" && convexEnabled && isAdminForMaterialAccess && (
          <UsersView adminEmail={currentUser.email} />
        )}
        {currentRoute === "payments" && convexEnabled && isAdminForMaterialAccess && (
          <PaymentsView adminEmail={currentUser.email} />
        )}
        {currentRoute === "comments" && (
          convexEnabled ? (
            <ConvexCommentsSection currentUser={currentUser} />
          ) : (
            <CommentsView
              currentUser={currentUser}
              comments={[]}
              remoteStatus="Comentarios disponibles al conectar Convex"
            />
          )
        )}
        {currentRoute === "profile" && (
          convexEnabled ? (
            <ConvexProfileSection
              currentUser={currentUser}
              subjectSelection={subjectSelection}
              pendingPayment={pendingPayment}
              onOpenSubjectSelection={() => setSubjectSelectionOpen(true)}
              onUserUpdate={onUserUpdate}
              onSignOut={onSignOut}
            />
          ) : (
            <ProfileView
              currentUser={currentUser}
              profile={currentUser}
              onSave={async (profile) => {
                const nextUser = { ...currentUser, ...profile };
                persistLocalUserProfile(nextUser);
                saveJson(SESSION_KEY, nextUser);
                onUserUpdate(nextUser);
              }}
              onSignOut={onSignOut}
            />
          )
        )}
      </main>
      <div id="toast" className={`toast ${toast ? "is-visible" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
      {convexEnabled && subjectSelectionOpen && subjectSelection && (
        <SubjectSelectionModal
          selectionState={subjectSelection}
          onCancel={() => {
            setSubjectSelectionOpen(false);
          }}
          onSave={updateSubjectSelection}
        />
      )}
      </>
      )}
    </>
  );
}

function BlockedAccountScreen({ onSignOut }) {
  return (
    <main className="blocked-account-screen">
      <section className="blocked-account-card">
        <p className="eyebrow">Cuenta bloqueada</p>
        <h1>Tu acceso a Synapse fue bloqueado</h1>
        <p>
          Esta cuenta fue bloqueada por romper reglas de uso o no cumplir con un comportamiento adecuado dentro de la app.
        </p>
        <button className="primary-action danger-primary" type="button" onClick={onSignOut}>
          Cerrar sesion
        </button>
      </section>
    </main>
  );
}

function SubjectSelectionModal({ selectionState, onCancel, onSave }) {
  const [query, setQuery] = useState("");
  const [selectedCodes, setSelectedCodes] = useState(() => selectionState.selectedSubjectCodes ?? []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmEditOpen, setConfirmEditOpen] = useState(false);
  const limit = selectionState.limit ?? 7;
  const availableSubjects = selectionState.availableSubjects ?? [];
  const normalizedQuery = normalizeSearchTextLocal(query);
  const selectedSet = new Set(selectedCodes);
  const visibleSubjects = availableSubjects.filter((subject) => {
    if (!normalizedQuery) return true;
    return normalizeSearchTextLocal([
      subject.code,
      subject.name,
      subject.careers?.map((career) => career.name).join(" "),
    ].join(" ")).includes(normalizedQuery);
  });
  const selectedSubjects = selectedCodes
    .map((code) => availableSubjects.find((subject) => subject.code === code))
    .filter(Boolean);
  const canEdit = !selectionState.modalSeen || (selectionState.editsRemaining ?? 0) > 0;
  const isRequiredFirstSelection = !selectionState.modalSeen;
  const selectionChanged = !sameStringSetLocal(selectedCodes, selectionState.selectedSubjectCodes ?? []);
  const periodEndLabel = selectionState.periodEnd
    ? new Date(selectionState.periodEnd).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" })
    : "durante los proximos 3 meses";
  const resetLabel = selectionState.periodEnd
    ? formatSubjectSelectionResetDate(selectionState.periodEnd)
    : "Se activa al guardar";

  useEffect(() => {
    setSelectedCodes(selectionState.selectedSubjectCodes ?? []);
  }, [selectionState.selectedSubjectCodes]);

  function toggleSubject(code) {
    setError("");
    setSelectedCodes((currentCodes) => {
      if (currentCodes.includes(code)) return currentCodes.filter((item) => item !== code);
      if (currentCodes.length >= limit) {
        setError(`Solo puedes escoger ${limit} materias por trimestre.`);
        return currentCodes;
      }
      return [...currentCodes, code];
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!canEdit) {
      setError("Ya usaste tus 2 ediciones de materias para este trimestre.");
      return;
    }
    if (selectedCodes.length === 0) {
      setError("Selecciona al menos una materia para continuar.");
      return;
    }
    if (!isRequiredFirstSelection && selectionChanged) {
      setConfirmEditOpen(true);
      return;
    }
    await saveSelection();
  }

  async function saveSelection() {
    try {
      setBusy(true);
      await onSave(selectedCodes);
    } catch (saveError) {
      setError(saveError?.message ?? "No se pudo guardar la seleccion.");
    } finally {
      setBusy(false);
      setConfirmEditOpen(false);
    }
  }

  return createPortal(
    <>
      <div className="course-detail-overlay is-visible subject-selection-overlay" role="dialog" aria-modal="true">
        <section className="course-detail-modal subject-selection-modal">
          <header>
            <div>
              <h2>Materias del trimestre</h2>
              <span>{selectedCodes.length}/{limit} seleccionadas · {selectionState.editsRemaining ?? 0} ediciones restantes</span>
            </div>
          </header>
          <form className="subject-selection-body" onSubmit={handleSubmit}>
            <p>
              Escoge hasta {limit} materias de tus carreras. Solo veras materiales y herramientas de estas materias hasta {periodEndLabel}.
            </p>
            {availableSubjects.length === 0 ? (
              <div className="subject-selection-empty">
                <strong>No hay carreras seleccionadas</strong>
                <span>Actualiza tu perfil para elegir tu carrera y poder escoger materias.</span>
              </div>
            ) : (
              <>
                <label className="subject-selection-search">
                  Buscar materia
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Nombre o codigo..."
                  />
                </label>
                <div className="subject-selection-picked" aria-label="Materias seleccionadas">
                  {selectedSubjects.length === 0 ? (
                    <span>Ninguna materia seleccionada todavia.</span>
                  ) : selectedSubjects.map((subject) => (
                    <button key={subject.code} type="button" onClick={() => toggleSubject(subject.code)}>
                      {subject.name} <small>{subject.code}</small>
                    </button>
                  ))}
                </div>
                <div className="subject-selection-list">
                  {visibleSubjects.map((subject) => {
                    const selected = selectedSet.has(subject.code);
                    return (
                      <button
                        key={subject.code}
                        className={selected ? "subject-selection-option is-selected" : "subject-selection-option"}
                        type="button"
                        onClick={() => toggleSubject(subject.code)}
                      >
                        <span>
                          <strong>{subject.name}</strong>
                          <small>{formatSubjectOptionMeta(subject)}</small>
                        </span>
                        <b>{selected ? "Seleccionada" : "Agregar"}</b>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {error && <p className="auth-error">{error}</p>}
            <div className="profile-actions subject-selection-actions">
              <div className="subject-selection-reset-note">
                <strong>Reinicio: {resetLabel}</strong>
                <span>{selectionState.editsRemaining ?? 0} ediciones restantes · vuelve a 2 al reiniciar</span>
              </div>
              {!isRequiredFirstSelection && (
                <button className="quiet-button" type="button" onClick={onCancel} disabled={busy}>
                  Cancelar
                </button>
              )}
              <button className="primary-action" type="submit" disabled={busy || availableSubjects.length === 0 || !canEdit}>
                {busy ? "Guardando..." : "Guardar materias"}
              </button>
            </div>
          </form>
        </section>
      </div>
      {confirmEditOpen && (
        <SubjectSelectionEditConfirmModal
          editsRemaining={selectionState.editsRemaining ?? 0}
          busy={busy}
          onCancel={() => setConfirmEditOpen(false)}
          onConfirm={saveSelection}
        />
      )}
    </>,
    document.body,
  );
}

function formatSubjectSelectionResetDate(timestamp) {
  return new Date(timestamp).toLocaleDateString("es-VE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function SubjectSelectionEditConfirmModal({ editsRemaining, busy, onCancel, onConfirm }) {
  const nextEdits = Math.max(0, editsRemaining - 1);
  return (
    <div className="course-detail-overlay is-visible subject-edit-confirm-overlay" role="dialog" aria-modal="true">
      <section className="course-detail-modal subject-edit-confirm-modal">
        <header>
          <div>
            <h2>Usar una edicion</h2>
            <span>Confirmacion requerida</span>
          </div>
        </header>
        <div className="course-detail-body">
          <p>
            Guardar estos cambios gastara una edicion de tus materias del trimestre. Te quedaran {nextEdits} ediciones disponibles.
          </p>
          <div className="profile-actions">
            <button className="quiet-button" type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
            <button className="primary-action" type="button" onClick={onConfirm} disabled={busy}>
              {busy ? "Guardando..." : "Si, guardar cambios"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ConvexProfileSection({ currentUser, subjectSelection, pendingPayment, onOpenSubjectSelection, onUserUpdate, onSignOut }) {
  const profile = useQuery(api.users.getProfile, { email: currentUser.email });
  const ensureProfile = useMutation(api.users.ensureProfile);

  async function saveProfile(profilePatch) {
    const nextUser = { ...currentUser, ...profilePatch };
    await ensureProfile(toProfileArgs(nextUser));
    persistLocalUserProfile(nextUser);
    saveJson(SESSION_KEY, nextUser);
    onUserUpdate(nextUser);
  }

  return (
    <ProfileView
      currentUser={currentUser}
      profile={profile}
      subjectSelection={subjectSelection}
      pendingPayment={pendingPayment}
      onOpenSubjectSelection={profile?.userType === "admin" ? undefined : onOpenSubjectSelection}
      onSave={saveProfile}
      onSignOut={onSignOut}
    />
  );
}

function ConvexMaterialsSection({ currentUser, entitlements, canLoadMaterials = true, search, format, level, subject, sort, savedOnly, onSearchChange, onFormatChange, onLevelChange, onSubjectChange, onSortChange, onSavedOnlyChange }) {
  const args = useMemo(() => ({ userEmail: currentUser.email, search, format, level, subject, sort, savedOnly }), [currentUser.email, search, format, level, subject, sort, savedOnly]);
  const filterKey = useMemo(() => JSON.stringify({ userEmail: currentUser.email, search, format, level, subject, sort, savedOnly, canLoadMaterials }), [currentUser.email, search, format, level, subject, sort, savedOnly, canLoadMaterials]);
  const libraryState = useQuery(api.documents.libraryRevision, canLoadMaterials ? {} : "skip");
  const libraryRevision = libraryState?.revision ?? 0;
  const catalogScopeKey = useMemo(() => [
    currentUser.email,
    (currentUser.careers ?? []).filter(Boolean).sort().join(","),
    (currentUser.selectedSubjectCodes ?? []).filter(Boolean).sort().join(","),
  ].join("::"), [currentUser.careers, currentUser.email, currentUser.selectedSubjectCodes]);
  const materialCatalog = useMaterialCatalog({ userEmail: currentUser.email, scopeKey: catalogScopeKey, serverRevision: libraryRevision, enabled: canLoadMaterials });
  const facetArgs = useMemo(() => ({ userEmail: currentUser.email, search, format, level, subject, savedOnly }), [currentUser.email, search, format, level, subject, savedOnly]);
  const access = useQuery(api.users.getAccess, { email: currentUser.email });
  const courseCatalog = useQuery(api.flows.listCourses, { userEmail: currentUser.email });
  const createDocument = useMutation(api.documents.create);
  const updateDocument = useMutation(api.documents.update);
  const deleteDocument = useMutation(api.documents.remove);
  const toggleSaved = useMutation(api.documents.toggleSaved);
  const rateDocument = useMutation(api.documents.rate);
  const removeDocumentRating = useMutation(api.documents.removeRating);
  const incrementView = useMutation(api.documents.incrementView);
  const consumeMaterialAccess = useMutation(api.users.consumeMaterialAccess);
  const ensureProfile = useMutation(api.users.ensureProfile);
  const rebuildLibraryStats = useMutation(api.documents.rebuildLibraryStats);
  const [localRows, setLocalRows] = useState([]);
  const [hiddenRowIds, setHiddenRowIds] = useState(() => new Set());
  const [displayLimit, setDisplayLimit] = useState(6);

  useEffect(() => {
    setLocalRows([]);
    setHiddenRowIds(new Set());
    setDisplayLimit(6);
  }, [filterKey]);

  useEffect(() => {
    const remoteIds = new Set((materialCatalog.results ?? []).map((row) => row._id));
    setLocalRows((currentRows) => currentRows.filter((row) => !remoteIds.has(row._id)));
  }, [materialCatalog.results]);

  const isAdminUser = access?.userType === "admin" || (access === undefined && ADMIN_EMAIL_FALLBACKS.includes(currentUser.email.toLowerCase()));
  const catalogRows = canLoadMaterials ? mergeMaterialRows(materialCatalog.results ?? [], localRows, hiddenRowIds) : [];
  const allowedSubjectCodes = useMemo(
    () => getSelectedSubjectCodeSet(currentUser, isAdminUser),
    [currentUser.selectedSubjectCodes, currentUser.userType, isAdminUser],
  );
  const scopedCatalogRows = allowedSubjectCodes
    ? catalogRows.filter((row) => materialSubjectIds(row).some((subjectId) => allowedSubjectCodes.has(subjectId)))
    : catalogRows;
  const allMaterialRows = sortMaterialRows(scopedCatalogRows.filter((row) => materialMatchesListFilters(row, args)), args.sort);
  const materialRows = allMaterialRows.slice(0, displayLimit);
  const materials = materialRows.map(fromConvexDocument);
  const rawMaterialSubjects = courseCatalog ?? [];
  const materialSubjects = useMemo(() => filterSubjectsForUserCareers(rawMaterialSubjects, currentUser, isAdminUser), [rawMaterialSubjects, currentUser, isAdminUser]);
  const displayedFacets = useMemo(() => buildFacetStatsFromRows(scopedCatalogRows, facetArgs), [scopedCatalogRows, facetArgs]);
  const filteredTotal = displayedFacets?.filteredTotal ?? 0;
  const hasMoreMaterials = displayLimit < allMaterialRows.length;
  const isLoadingFirstPage = canLoadMaterials && materialCatalog.status === "LoadingFirstPage" && allMaterialRows.length === 0;
  const isLoadingMore = false;
  const canAddMaterials =
    access?.canAddMaterials === true ||
    (access === undefined && ADMIN_EMAIL_FALLBACKS.includes(currentUser.email.toLowerCase()));

  useEffect(() => {
    if (!canLoadMaterials || !libraryState || (libraryState.statsReady && libraryState.searchIndexReady) || !canAddMaterials) return;
    rebuildLibraryStats({ userEmail: currentUser.email }).catch((error) => {
      console.warn("No se pudieron inicializar los indices de biblioteca.", error);
    });
  }, [canAddMaterials, canLoadMaterials, currentUser.email, libraryState, rebuildLibraryStats]);

  useEffect(() => {
    if (!currentUser.email) return;
    ensureProfile(toProfileArgs(currentUser))
      .catch((error) => {
        console.warn("No se pudo preparar el perfil del usuario.", error);
      });
  }, [currentUser, ensureProfile]);

  useEffect(() => {
    if (subject === "Todas" || materialSubjects.length === 0) return;
    if (!materialSubjects.some((item) => item.id === subject)) onSubjectChange("Todas");
  }, [materialSubjects, onSubjectChange, subject]);

  async function addMaterial(material) {
    if (!canAddMaterials) throw new Error("Solo administradores pueden agregar materiales.");
    const image = await uploadMaterialImage(material.imageFile, currentUser.email);
    const now = Date.now();

    if (material.sourceType === "drive" || material.sourceType === "youtube") {
      const isYoutube = material.sourceType === "youtube";
      const document = {
        title: material.title,
        subject: material.subjects?.[0] ?? material.subject,
        subjects: material.subjects ?? [material.subject].filter(Boolean),
        format: isYoutube ? "Video" : material.format,
        level: material.level,
        source: isYoutube ? "YouTube" : "Link externo",
        externalUrl: material.externalUrl,
        imageStorageBucket: image?.bucket,
        imageStoragePath: image?.path,
        imageFileName: image?.fileName,
        userEmail: currentUser.email,
        metadata: isYoutube ? { kind: "youtube-video", provider: "youtube" } : { kind: "drive-link", provider: "drive" },
      };
      const id = await createDocument(document);
      const row = toOptimisticDocumentRow(id, document, now, currentUser.email);
      insertMaterialEverywhere(row);
      adjustDisplayedFacets(row, 1);
      return;
    }

    const storage = await uploadMaterialPdf(material.file, currentUser.email);
    const document = {
      title: material.title,
      subject: material.subjects?.[0] ?? material.subject,
      subjects: material.subjects ?? [material.subject].filter(Boolean),
      format: material.format || "PDF",
      level: material.level,
      source: storage.fileName,
      storageBucket: storage.bucket,
      storagePath: storage.path,
      imageStorageBucket: image?.bucket,
      imageStoragePath: image?.path,
      imageFileName: image?.fileName,
      fileName: storage.fileName,
      mimeType: storage.mimeType,
      fileSize: storage.size,
      userEmail: currentUser.email,
      metadata: { storage: "supabase", kind: "pdf" },
    };
    const id = await createDocument(document);
    const row = toOptimisticDocumentRow(id, document, now, currentUser.email);
    insertMaterialEverywhere(row);
    adjustDisplayedFacets(row, 1);
  }

  async function toggleMaterialSaved(material) {
    updateMaterialEverywhere(material._id, (item) => ({ ...item, saved: !item.saved }));
    try {
      await toggleSaved({ id: material._id, userEmail: currentUser.email });
    } catch (error) {
      updateMaterialEverywhere(material._id, (item) => ({ ...item, saved: !item.saved }));
      throw error;
    }
  }

  async function rateMaterial(material, rating) {
    updateMaterialEverywhere(material._id, (item) => optimisticRatingPatch(item, rating));
    rateDocument({ id: material._id, userEmail: currentUser.email, rating }).catch((error) => {
      console.warn("No se pudo guardar la calificacion.", error);
    });
  }

  async function clearMaterialRating(material) {
    updateMaterialEverywhere(material._id, optimisticRemoveRatingPatch);
    removeDocumentRating({ id: material._id, userEmail: currentUser.email }).catch((error) => {
      console.warn("No se pudo quitar la calificacion.", error);
    });
  }

  async function registerMaterialView(material) {
    updateMaterialEverywhere(material._id, (item) => ({ ...item, viewCount: (item.viewCount ?? 0) + 1 }));
    incrementView({ id: material._id }).catch((error) => {
      console.warn("No se pudo registrar la vista.", error);
    });
  }

  function requestMaterialAccess(material) {
    const plan = entitlements?.plan ?? currentUser.plan ?? "free";
    const isAdmin = entitlements?.isAdmin || currentUser.userType === "admin";
    const isProMaterial = String(material.level ?? "").toLowerCase() === "pro";
    if (isAdmin || plan !== "free" || !isProMaterial) return { allowed: true };

    const usedIds = entitlements?.proMaterials?.usedIds ?? [];
    const alreadyUsed = usedIds.includes(String(material._id));
    if (alreadyUsed) return { allowed: true };

    const remaining = entitlements?.proMaterials?.remaining ?? 0;
    if (remaining <= 0) {
      return {
        allowed: false,
        title: "Limite mensual alcanzado",
        message: "Ya usaste tus 3 materiales Pro de este mes. Mejora a Pro para abrir materiales Pro sin limites.",
        actionLabel: "Ver planes",
        onAction: () => { window.location.hash = "plans"; },
      };
    }

    return {
      allowed: false,
      needsConfirmation: true,
      title: "Usar material Pro",
      message: `Este material gastara 1 de tus 3 materiales Pro del mes. Te quedaran ${Math.max(0, remaining - 1)}.`,
      confirmLabel: "Abrir material",
      onConfirm: async () => {
        await consumeMaterialAccess({ email: currentUser.email, documentId: material._id });
      },
    };
  }

  function getMaterialAccessBadge(material) {
    const plan = entitlements?.plan ?? currentUser.plan ?? "free";
    const isAdmin = entitlements?.isAdmin || currentUser.userType === "admin";
    const isProMaterial = String(material.level ?? "").toLowerCase() === "pro";
    if (!isProMaterial) {
      return {
        icon: "✓",
        label: "Libre",
        title: "Material gratis disponible para tu cuenta.",
        className: "has-access-free",
      };
    }
    if (isAdmin || plan !== "free") {
      return {
        icon: "✓",
        label: "Desbloqueado",
        title: "Material Pro desbloqueado por tu plan.",
        className: "has-access-unlocked",
      };
    }
    const usedIds = entitlements?.proMaterials?.usedIds ?? [];
    const remaining = entitlements?.proMaterials?.remaining ?? 0;
    if (usedIds.includes(String(material._id))) {
      return {
        icon: "✓",
        label: `Desbloqueado · ${remaining} usos`,
        title: `Ya usaste cupo para este material Pro este mes. Te quedan ${remaining} usos Pro.`,
        className: "has-access-unlocked",
      };
    }
    if (remaining > 0) {
      return {
        icon: "↯",
        label: `${remaining} usos`,
        title: `Material Pro. Te quedan ${remaining} usos para desbloquear materiales Pro este mes.`,
        className: "has-access-quota",
      };
    }
    return {
      icon: "⌁",
      label: "0 usos",
      title: "Ya usaste tus 3 materiales Pro de este mes. Mejora tu plan para desbloquear mas.",
      className: "has-access-locked",
    };
  }

  function updateMaterialEverywhere(materialId, updater) {
    const existingRow = findMaterialRow(materialId, localRows, materialCatalog.results ?? []);
    if (existingRow) {
      const updatedRow = updater(existingRow);
      setLocalRows((currentRows) => upsertLocalMaterialRow(currentRows, updatedRow, args));
    }
    materialCatalog.updateRow(materialId, updater);
  }

  function removeMaterialEverywhere(materialId) {
    setHiddenRowIds((currentIds) => new Set([...currentIds, materialId]));
    setLocalRows((currentRows) => removeMaterialRows(currentRows, materialId));
    materialCatalog.removeRow(materialId);
  }

  function insertMaterialEverywhere(row) {
    if (materialMatchesListFilters(row, args)) {
      setHiddenRowIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(row._id);
        return nextIds;
      });
      setLocalRows((currentRows) => upsertLocalMaterialRow(currentRows, row, args));
    }
    materialCatalog.upsertRow(row);
  }

  function loadMoreMaterialsPage() {
    if (displayLimit < allMaterialRows.length) {
      setDisplayLimit((currentLimit) => currentLimit + 6);
      return;
    }
  }

  async function editMaterial(updatedMaterial) {
    if (!canAddMaterials) throw new Error("Solo administradores pueden editar materiales.");
    
    const originalMaterial = findMaterialRow(updatedMaterial._id, localRows, materialCatalog.results ?? []) || updatedMaterial;
    let replacedStoragePath = null;
    let replacedImageStoragePath = null;
    
    let nextImageFields = {};
    if (updatedMaterial.imageFile && updatedMaterial.imageFile.size > 0) {
      const image = await uploadMaterialImage(updatedMaterial.imageFile, currentUser.email);
      if (image) {
        replacedImageStoragePath = updatedMaterial.imageStoragePath ?? null;
        nextImageFields = {
          imageStorageBucket: image.bucket,
          imageStoragePath: image.path,
          imageFileName: image.fileName,
        };
      }
    }

    const updatePayload = {
      id: updatedMaterial._id,
      title: updatedMaterial.title,
      subject: updatedMaterial.subjects?.[0] ?? updatedMaterial.subject,
      subjects: updatedMaterial.subjects ?? [updatedMaterial.subject].filter(Boolean),
      format: updatedMaterial.format,
      level: updatedMaterial.level,
      userEmail: currentUser.email,
      ...nextImageFields,
    };

    if (updatedMaterial.sourceType === "drive" || updatedMaterial.sourceType === "youtube") {
      const isYoutube = updatedMaterial.sourceType === "youtube";
      updatePayload.format = isYoutube ? "Video" : updatedMaterial.format;
      updatePayload.source = isYoutube ? "YouTube" : "Link externo";
      updatePayload.externalUrl = updatedMaterial.externalUrl;
      updatePayload.clearStorageFile = true;
      updatePayload.metadata = isYoutube ? { kind: "youtube-video", provider: "youtube" } : { kind: "drive-link", provider: "drive" };
      replacedStoragePath = updatedMaterial.storagePath ?? null;
    }

    if (updatedMaterial.sourceType === "pdf") {
      if (updatedMaterial.file && updatedMaterial.file.size > 0) {
        const storage = await uploadMaterialPdf(updatedMaterial.file, currentUser.email);
        replacedStoragePath = updatedMaterial.storagePath ?? null;
        updatePayload.source = storage.fileName;
        updatePayload.storageBucket = storage.bucket;
        updatePayload.storagePath = storage.path;
        updatePayload.fileName = storage.fileName;
        updatePayload.mimeType = storage.mimeType;
        updatePayload.fileSize = storage.size;
        updatePayload.clearExternalUrl = true;
        updatePayload.metadata = { storage: "supabase", kind: "pdf" };
      } else {
        updatePayload.clearExternalUrl = !updatedMaterial.externalUrl;
      }
    }

    await updateDocument(updatePayload);
    if (replacedStoragePath && replacedStoragePath !== updatePayload.storagePath) {
      deleteMaterialFile(replacedStoragePath).catch((error) => {
        console.warn("No se pudo limpiar el archivo anterior del material.", error);
      });
    }
    if (replacedImageStoragePath && replacedImageStoragePath !== updatePayload.imageStoragePath) {
      deleteMaterialFile(replacedImageStoragePath).catch((error) => {
        console.warn("No se pudo limpiar la imagen anterior del material.", error);
      });
    }
    updateMaterialEverywhere(updatedMaterial._id, (item) => ({
      ...item,
      title: updatedMaterial.title,
      subject: updatePayload.subject,
      subjects: updatePayload.subjects,
      format: updatePayload.format,
      level: updatedMaterial.level,
      source: updatePayload.source ?? item.source,
      externalUrl: updatePayload.clearExternalUrl ? undefined : updatePayload.externalUrl ?? item.externalUrl,
      storageBucket: updatePayload.clearStorageFile ? undefined : updatePayload.storageBucket ?? item.storageBucket,
      storagePath: updatePayload.clearStorageFile ? undefined : updatePayload.storagePath ?? item.storagePath,
      imageStorageBucket: nextImageFields.imageStorageBucket ?? item.imageStorageBucket,
      imageStoragePath: nextImageFields.imageStoragePath ?? item.imageStoragePath,
      imageFileName: nextImageFields.imageFileName ?? item.imageFileName,
      fileName: updatePayload.clearStorageFile ? undefined : updatePayload.fileName ?? item.fileName,
      mimeType: updatePayload.clearStorageFile ? undefined : updatePayload.mimeType ?? item.mimeType,
      fileSize: updatePayload.clearStorageFile ? undefined : updatePayload.fileSize ?? item.fileSize,
      updatedAt: Date.now(),
    }));
    adjustDisplayedFacets(originalMaterial, -1);
    adjustDisplayedFacets({
      ...updatedMaterial,
      subject: updatePayload.subject,
      subjects: updatePayload.subjects,
      format: updatePayload.format,
      level: updatedMaterial.level,
      externalUrl: updatePayload.clearExternalUrl ? undefined : updatePayload.externalUrl ?? updatedMaterial.externalUrl,
      storagePath: updatePayload.clearStorageFile ? undefined : updatePayload.storagePath ?? updatedMaterial.storagePath,
      imageStoragePath: nextImageFields.imageStoragePath ?? updatedMaterial.imageStoragePath,
      fileName: updatePayload.clearStorageFile ? undefined : updatePayload.fileName ?? updatedMaterial.fileName,
    }, 1);
  }

  async function deleteMaterial(material) {
    if (!canAddMaterials) throw new Error("Solo administradores pueden borrar materiales.");
    removeMaterialEverywhere(material._id);
    adjustDisplayedFacets(material, -1);
    try {
      await deleteDocument({ id: material._id, userEmail: currentUser.email });
    } catch (error) {
      const message = String(error?.message ?? "");
      if (!message.includes("Documento no disponible")) {
        insertMaterialEverywhere(material);
        adjustDisplayedFacets(material, 1);
        throw error;
      }
    }

    Promise.all([
      deleteMaterialFile(material.storagePath),
      deleteMaterialFile(material.imageStoragePath),
    ]).catch((error) => {
      console.warn("No se pudo limpiar un archivo del material borrado.", error);
    });
  }

  function adjustDisplayedFacets(material, delta) {
    void material;
    void delta;
  }

  return (
    <MaterialsView
      materials={materials}
      subjects={materialSubjects}
      watermarkText={buildMaterialWatermark(currentUser)}
      remoteStatus={!canLoadMaterials ? "Selecciona tus materias para cargar la biblioteca" : materialCatalog.status === "LoadingFirstPage" ? "Creando cache local" : "Busqueda local instantanea"}
      canAddMaterial={canAddMaterials}
      search={search}
      format={format}
      level={level}
      subject={subject}
      sort={sort}
      savedOnly={savedOnly}
      onSearchChange={onSearchChange}
      onFormatChange={onFormatChange}
      onLevelChange={onLevelChange}
      onSubjectChange={onSubjectChange}
      onSortChange={onSortChange}
      onSavedOnlyChange={onSavedOnlyChange}
      onAddMaterial={addMaterial}
      onEditMaterial={editMaterial}
      onDeleteMaterial={deleteMaterial}
      onToggleSaved={toggleMaterialSaved}
      onRateMaterial={rateMaterial}
      onClearMaterialRating={clearMaterialRating}
      onMaterialOpen={registerMaterialView}
      onBeforeOpenMaterial={requestMaterialAccess}
      getMaterialAccessBadge={getMaterialAccessBadge}
      countStats={displayedFacets}
      hasMore={hasMoreMaterials}
      isLoadingFirst={isLoadingFirstPage}
      isLoadingMore={isLoadingMore}
      onLoadMore={loadMoreMaterialsPage}
    />
  );
}

function removeMaterialRows(rows, materialId) {
  return rows.filter((row) => row._id !== materialId);
}

function composeVisibleMaterialRows(remoteRows = [], localRows = [], hiddenRowIds = new Set(), listArgs = {}) {
  const mergedRows = mergeMaterialRows(remoteRows, localRows, hiddenRowIds);
  return sortMaterialRows(mergedRows.filter((row) => materialMatchesListFilters(row, listArgs)), listArgs.sort);
}

function mergeMaterialRows(remoteRows = [], localRows = [], hiddenRowIds = new Set()) {
  const mergedRows = [
    ...localRows,
    ...remoteRows,
  ].filter((row) => !hiddenRowIds.has(row._id));
  const seenIds = new Set();
  return mergedRows.filter((row) => {
    if (!row?._id || seenIds.has(row._id)) return false;
    seenIds.add(row._id);
    return true;
  });
}

function upsertLocalMaterialRow(rows, row, listArgs = {}) {
  return sortMaterialRows([row, ...removeMaterialRows(rows, row._id)], listArgs.sort);
}

function insertMaterialRow(rows, row, listArgs = {}) {
  const sorted = upsertLocalMaterialRow(rows, row, listArgs);
  const limit = Math.min(Math.max(listArgs.limit ?? sorted.length, 1), 60);
  return sorted.slice(0, limit);
}

function findMaterialRow(materialId, localRows = [], remoteRows = []) {
  return localRows.find((row) => row._id === materialId) ?? remoteRows.find((row) => row._id === materialId) ?? null;
}

function sortMaterialRows(rows, sort = "Recientes") {
  const copy = [...rows];
  if (sort === "Mas vistos") {
    return copy.sort((left, right) =>
      (right.viewCount ?? 0) - (left.viewCount ?? 0) ||
      (right.createdAt ?? 0) - (left.createdAt ?? 0),
    );
  }
  return copy.sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0));
}

function materialMatchesListFilters(row, listArgs = {}) {
  const format = listArgs.format && listArgs.format !== "Todos" ? listArgs.format : null;
  const level = listArgs.level && listArgs.level !== "Todos" ? listArgs.level : null;
  const subject = listArgs.subject && listArgs.subject !== "Todas" ? listArgs.subject : null;
  const search = normalizeSearchTextLocal(listArgs.search);

  if (listArgs.savedOnly && !row.saved) return false;
  if (format && row.format !== format) return false;
  if (level && row.level !== level) return false;
  if (subject && !materialSubjectIds(row).includes(subject)) return false;
  if (!search) return true;

  return normalizeSearchTextLocal([row.title, materialSubjectIds(row).join(" "), row.format, row.level, row.fileName].join(" ")).includes(search);
}

function materialMatchesFacetBase(row, facetArgs = {}) {
  if (facetArgs.savedOnly) return Boolean(row.saved);
  const search = normalizeSearchTextLocal(facetArgs.search);
  if (!search) return true;
  return normalizeSearchTextLocal([row.title, materialSubjectIds(row).join(" "), row.format, row.level, row.fileName].join(" ")).includes(search);
}

function materialMatchesFacetFilters(row, facetArgs = {}) {
  const format = facetArgs.format && facetArgs.format !== "Todos" ? facetArgs.format : null;
  const level = facetArgs.level && facetArgs.level !== "Todos" ? facetArgs.level : null;
  const subject = facetArgs.subject && facetArgs.subject !== "Todas" ? facetArgs.subject : null;

  if (format && row.format !== format) return false;
  if (level && row.level !== level) return false;
  if (subject && !materialSubjectIds(row).includes(subject)) return false;
  return true;
}

function materialMatchesFormatFacetContext(row, facetArgs = {}) {
  const level = facetArgs.level && facetArgs.level !== "Todos" ? facetArgs.level : null;
  const subject = facetArgs.subject && facetArgs.subject !== "Todas" ? facetArgs.subject : null;
  if (level && row.level !== level) return false;
  if (subject && !materialSubjectIds(row).includes(subject)) return false;
  return true;
}

function materialMatchesLevelFacetContext(row, facetArgs = {}) {
  const format = facetArgs.format && facetArgs.format !== "Todos" ? facetArgs.format : null;
  const subject = facetArgs.subject && facetArgs.subject !== "Todas" ? facetArgs.subject : null;
  if (format && row.format !== format) return false;
  if (subject && !materialSubjectIds(row).includes(subject)) return false;
  return true;
}

function materialMatchesSubjectFacetContext(row, facetArgs = {}) {
  const format = facetArgs.format && facetArgs.format !== "Todos" ? facetArgs.format : null;
  const level = facetArgs.level && facetArgs.level !== "Todos" ? facetArgs.level : null;
  if (format && row.format !== format) return false;
  if (level && row.level !== level) return false;
  return true;
}

function buildFacetStatsFromRows(rows = [], facetArgs = {}) {
  const visibleRows = rows.filter((row) => materialMatchesFacetBase(row, facetArgs));
  const filteredRows = visibleRows.filter((row) => materialMatchesFacetFilters(row, facetArgs));
  const formatContextRows = visibleRows.filter((row) => materialMatchesFormatFacetContext(row, facetArgs));
  const levelContextRows = visibleRows.filter((row) => materialMatchesLevelFacetContext(row, facetArgs));
  const subjectContextRows = visibleRows.filter((row) => materialMatchesSubjectFacetContext(row, facetArgs));

  return {
    total: visibleRows.length,
    filteredTotal: filteredRows.length,
    formatTotal: formatContextRows.length,
    levelTotal: levelContextRows.length,
    subjectTotal: subjectContextRows.length,
    formats: countRowsBy(formatContextRows, "format"),
    levels: countRowsBy(levelContextRows, "level"),
    subjects: countRowsBySubjects(subjectContextRows),
  };
}

function countRowsBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = row?.[key];
    if (value) counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function countRowsBySubjects(rows) {
  return rows.reduce((counts, row) => {
    for (const subjectId of materialSubjectIds(row)) {
      counts[subjectId] = (counts[subjectId] ?? 0) + 1;
    }
    return counts;
  }, {});
}

function adjustFacetCount(counts = {}, key, delta) {
  if (!key) return counts ?? {};
  const nextCounts = { ...(counts ?? {}) };
  const nextValue = Math.max(0, (nextCounts[key] ?? 0) + delta);
  if (nextValue === 0) {
    delete nextCounts[key];
  } else {
    nextCounts[key] = nextValue;
  }
  return nextCounts;
}

function adjustFacetSubjectCounts(counts = {}, subjectIds, delta) {
  let nextCounts = { ...(counts ?? {}) };
  for (const subjectId of subjectIds) {
    nextCounts = adjustFacetCount(nextCounts, subjectId, delta);
  }
  return nextCounts;
}

function materialSubjectIds(row) {
  if (Array.isArray(row?.subjects) && row.subjects.length > 0) {
    return Array.from(new Set(row.subjects.filter(Boolean)));
  }
  return row?.subject ? [row.subject] : [];
}

function toOptimisticDocumentRow(id, document, timestamp, ownerEmail) {
  const { userEmail, ...fields } = document;
  return {
    _id: id,
    ...fields,
    saved: false,
    viewCount: 0,
    ratingAverage: 0,
    ratingCount: 0,
    userRating: null,
    ownerId: ownerEmail,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function normalizeSearchTextLocal(value) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function estimateJsonBytes(value) {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    try {
      return JSON.stringify(value).length;
    } catch {
      return 0;
    }
  }
}

function formatApproxBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
}

function ConvexUserProfileSync({ currentUser }) {
  const ensureProfile = useMutation(api.users.ensureProfile);

  useEffect(() => {
    if (!currentUser?.email) return;
    ensureProfile(toProfileArgs(currentUser)).catch((error) => {
      console.warn("No se pudo preparar el perfil del usuario.", error);
    });
  }, [currentUser, ensureProfile]);

  return null;
}

function ConvexCommentsSection({ currentUser }) {
  const comments = useQuery(api.comments.list, { userEmail: currentUser.email }) ?? [];
  const access = useQuery(api.users.getAccess, { email: currentUser.email });
  const canModerate = access?.userType === "admin";
  const reports = useQuery(api.comments.listReports, canModerate ? { adminEmail: currentUser.email } : "skip") ?? [];
  const createComment = useMutation(api.comments.create);
  const toggleLike = useMutation(api.comments.toggleLike);
  const updateComment = useMutation(api.comments.update);
  const removeComment = useMutation(api.comments.remove);
  const reportComment = useMutation(api.comments.report);
  const resolveReport = useMutation(api.comments.resolveReport);

  async function addComment(comment) {
    await createComment({
      body: comment.body,
      parentId: comment.parentId,
      userEmail: currentUser.email,
    });
  }

  async function toggleCommentLike(comment) {
    await toggleLike({ id: comment._id, userEmail: currentUser.email });
  }

  async function editComment(comment) {
    await updateComment({ id: comment._id, body: comment.body, userEmail: currentUser.email });
  }

  async function deleteComment(comment) {
    await removeComment({ id: comment._id, userEmail: currentUser.email });
  }

  async function submitReport(report) {
    await reportComment({
      id: report.comment._id,
      userEmail: currentUser.email,
      reason: report.reason,
      details: report.details,
    });
  }

  async function resolveCommentReport(report) {
    await resolveReport({
      commentId: report.comment._id,
      adminEmail: currentUser.email,
      action: report.action,
    });
  }

  return (
    <CommentsView
      comments={comments}
      currentUser={currentUser}
      canModerate={canModerate}
      reports={reports}
      remoteStatus="Comentarios sincronizados con Synapse"
      onCreateComment={addComment}
      onToggleLike={toggleCommentLike}
      onEditComment={editComment}
      onDeleteComment={deleteComment}
      onReportComment={submitReport}
      onResolveReport={resolveCommentReport}
    />
  );
}

function fromConvexDocument(row) {
  return {
    _id: row._id,
    id: row._id,
    title: row.title,
    subject: row.subject,
    subjects: row.subjects ?? (row.subject ? [row.subject] : []),
    format: row.format,
    source: row.source,
    externalUrl: row.externalUrl,
    storagePath: row.storagePath,
    imageStoragePath: row.imageStoragePath,
    imageFileName: row.imageFileName,
    fileName: row.fileName,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    level: row.level,
    viewCount: row.viewCount ?? 0,
    ratingAverage: row.ratingAverage ?? 0,
    ratingCount: row.ratingCount ?? 0,
    userRating: row.userRating ?? 0,
    saved: row.saved,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    updated: row.updatedAt ? new Date(row.updatedAt).toISOString().slice(0, 10) : "",
  };
}

function optimisticRatingPatch(material, rating) {
  const previousUserRating = material.userRating ?? 0;
  const previousCount = material.ratingCount ?? 0;
  const previousAverage = material.ratingAverage ?? 0;
  const nextCount = previousUserRating ? previousCount : previousCount + 1;
  const previousTotal = previousAverage * previousCount;
  const nextTotal = previousUserRating
    ? previousTotal - previousUserRating + rating
    : previousTotal + rating;

  return {
    ...material,
    userRating: rating,
    ratingCount: nextCount,
    ratingAverage: nextCount ? nextTotal / nextCount : rating,
  };
}

function optimisticRemoveRatingPatch(material) {
  const previousUserRating = material.userRating ?? 0;
  if (!previousUserRating) return material;
  const previousCount = material.ratingCount ?? 0;
  const previousAverage = material.ratingAverage ?? 0;
  const nextCount = Math.max(0, previousCount - 1);
  const nextTotal = Math.max(0, previousAverage * previousCount - previousUserRating);

  return {
    ...material,
    userRating: 0,
    ratingCount: nextCount,
    ratingAverage: nextCount ? nextTotal / nextCount : 0,
  };
}

function filterSubjectsForUserCareers(subjectList, user, canSeeAll = false) {
  const selectedCareers = Array.isArray(user?.careers) ? user.careers.filter(Boolean) : [];
  const selectedSubjects = getSelectedSubjectCodeSet(user, canSeeAll);
  if (canSeeAll || user?.userType === "admin" || selectedCareers.length === 0) return subjectList;
  const allowedCareers = new Set(selectedCareers);
  return subjectList.filter((subject) => {
    if (!Array.isArray(subject.careers) || subject.careers.length === 0) return false;
    const belongsToCareer = subject.careers.some((career) => allowedCareers.has(career.id));
    if (!belongsToCareer) return false;
    return !selectedSubjects || selectedSubjects.has(subject.id) || selectedSubjects.has(subject.code);
  });
}

function getSelectedSubjectCodeSet(user, canSeeAll = false) {
  if (canSeeAll || user?.userType === "admin") return null;
  const selectedSubjectCodes = Array.isArray(user?.selectedSubjectCodes)
    ? user.selectedSubjectCodes.filter(Boolean)
    : [];
  return selectedSubjectCodes.length ? new Set(selectedSubjectCodes) : null;
}

function sameStringSetLocal(left = [], right = []) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}

function buildToolSubjectsForUser(user, canSeeAll = false) {
  if (canSeeAll) return [{ id: "sub-matematica-basica", name: "Matematica Basica" }];
  const selectedSubjectCodes = Array.isArray(user?.selectedSubjectCodes)
    ? user.selectedSubjectCodes.filter(Boolean)
    : [];
  if (selectedSubjectCodes.length === 0) return subjects;
  const allowedToolSubjects = [];
  if (selectedSubjectCodes.includes("FBTMM01")) {
    allowedToolSubjects.push({ id: "sub-matematica-basica", name: "Matematica Basica" });
  }
  return allowedToolSubjects.length ? allowedToolSubjects : [{ id: "__sin_herramientas__", name: "Sin herramientas disponibles" }];
}

function formatSubjectOptionMeta(subject) {
  const careerNames = Array.isArray(subject?.careers)
    ? subject.careers.map((career) => career.name.replace("Ingenieria ", "")).join(", ")
    : "";
  return [subject?.code, careerNames].filter(Boolean).join(" · ");
}

function buildMaterialWatermark(user) {
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  const identity = [fullName, user?.email].filter(Boolean).join(" · ");
  const date = new Date().toLocaleDateString("es-VE", { year: "numeric", month: "2-digit", day: "2-digit" });
  return [identity || "Usuario Synapse", date].join(" · ");
}

function ConvexFlowSection({ currentUser, canLoadMaterials = true, onOpenMaterialInLibrary }) {
  const [career, setCareer] = useState(() => currentUser.careers?.[0] ?? "sistemas");
  const args = useMemo(() => ({ career, userEmail: currentUser.email }), [career, currentUser.email]);
  const access = useQuery(api.users.getAccess, { email: currentUser.email });
  const libraryState = useQuery(api.documents.libraryRevision, canLoadMaterials ? {} : "skip");
  const libraryRevision = libraryState?.revision ?? 0;
  const catalogScopeKey = useMemo(() => [
    currentUser.email,
    (currentUser.careers ?? []).filter(Boolean).sort().join(","),
    (currentUser.selectedSubjectCodes ?? []).filter(Boolean).sort().join(","),
  ].join("::"), [currentUser.careers, currentUser.email, currentUser.selectedSubjectCodes]);
  const materialCatalog = useMaterialCatalog({ userEmail: currentUser.email, scopeKey: catalogScopeKey, serverRevision: libraryRevision, enabled: canLoadMaterials });
  const { data: flowData, isFromCache } = useCachedConvexQuery(api.flows.getFlow, args, "flows.getFlow", {
    initialValue: null,
    ttlMs: 1000 * 60 * 30,
  });
  const { data: careersData } = useCachedConvexQuery(api.flows.listCareers, {}, "flows.listCareers", {
    initialValue: [],
    ttlMs: 1000 * 60 * 60,
  });
  const setStatus = useMutation(api.flows.setStatus);
  const [optimisticStatuses, setOptimisticStatuses] = useState({});
  const isAdminUser = access?.userType === "admin" || (access === undefined && ADMIN_EMAIL_FALLBACKS.includes(currentUser.email.toLowerCase()));
  const allowedSubjectCodes = getSelectedSubjectCodeSet(currentUser, isAdminUser);
  const catalogRows = canLoadMaterials ? materialCatalog.results ?? [] : [];
  const flowMaterialRows = useMemo(() => {
    const scopedRows = allowedSubjectCodes
      ? catalogRows.filter((row) => materialSubjectIds(row).some((subjectId) => allowedSubjectCodes.has(subjectId)))
      : catalogRows;
    return sortMaterialRows(scopedRows, "Recientes");
  }, [allowedSubjectCodes, catalogRows]);
  const flowMaterials = useMemo(() => flowMaterialRows.map(fromConvexDocument), [flowMaterialRows]);
  const allowedCareerIds = isAdminUser && careersData.length
    ? careersData.map((item) => item.id)
    : currentUser.careers?.length ? currentUser.careers : [career];
  const allowedCareers = careersData.length
    ? careersData.filter((item) => allowedCareerIds.includes(item.id))
    : allowedCareerIds.map((id) => ({ id, name: id === "sistemas" ? "Ingenieria de Sistemas" : id }));

  useEffect(() => {
    if (allowedCareerIds.includes(career)) return;
    setCareer(allowedCareerIds[0] ?? "sistemas");
  }, [allowedCareerIds, career]);

  useEffect(() => {
    setOptimisticStatuses(flowData?.statuses ?? {});
  }, [flowData?.id, flowData?.statuses]);

  useEffect(() => {
    if (!canLoadMaterials || materialCatalog.status === "LoadingFirstPage") return;
    console.info(
      `[Synapse flow] Flujograma usando ${flowMaterialRows.length} metadatos de materiales, ${formatApproxBytes(estimateJsonBytes(flowMaterialRows))} aprox. No se descargaron PDFs ni imagenes.`,
    );
  }, [canLoadMaterials, flowMaterialRows, materialCatalog.status]);

  async function updateStatus(courseCode, status) {
    const nextStatuses = { ...optimisticStatuses, [courseCode]: status };
    setOptimisticStatuses(nextStatuses);
    if (flowData) {
      writeConvexCache("flows.getFlow", args, { ...flowData, statuses: nextStatuses });
    }
    await setStatus({ userEmail: currentUser.email, career, courseCode, status });
  }

  if (!flowData) {
    return (
      <section className="workspace">
        <div className="workspace-header">
          <div>
            <p className="eyebrow">Flujograma</p>
            <h1>Cargando flujograma</h1>
            <p>Buscando la informacion academica guardada para tu cuenta.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <FlowView
      flowPeriods={flowData.periods}
      flowStatuses={optimisticStatuses}
      flowProgram={flowData}
      materials={flowMaterials}
      careers={allowedCareers}
      selectedCareer={career}
      cacheStatus={isFromCache ? "Vista guardada localmente" : "Datos actualizados"}
      onCareerChange={setCareer}
      onStatusChange={updateStatus}
      onOpenMaterialInLibrary={onOpenMaterialInLibrary}
    />
  );
}

function toProfileArgs(user) {
  const args = {
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    nationalId: user.nationalId,
    phone: user.phone,
    careers: Array.isArray(user.careers) ? user.careers : undefined,
  };
  return Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined && value !== ""));
}

function filterMaterials(materials, search, format, level = "Todos", subject = "Todas") {
  const query = normalizeSearchText(search);
  return materials.filter((material) => {
    const subjectIds = materialSubjectIds(material);
    const matchesSearch = !query || normalizeSearchText([material.title, subjectIds.join(" "), material.format, material.source, material.level].join(" ")).includes(query);
    const matchesFormat = format === "Todos" || material.format === format;
    const matchesLevel = level === "Todos" || material.level === level;
    const matchesSubject = subject === "Todas" || subjectIds.includes(subject);
    return matchesSearch && matchesFormat && matchesLevel && matchesSubject;
  });
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function persistLocalUserProfile(user) {
  try {
    const users = JSON.parse(window.localStorage.getItem(LOCAL_USERS_KEY) ?? "{}");
    if (users[user.email]) {
      users[user.email] = { ...users[user.email], ...user };
      window.localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
    }
  } catch (error) {
    console.warn("No se pudo actualizar el perfil local.", error);
  }
}
