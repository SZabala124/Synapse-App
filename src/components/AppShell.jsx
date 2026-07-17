import logoUrl from "../../Synapse.svg";

const navItems = [
  ["landing", "Inicio"],
  ["career", "Flujograma"],
  ["materials", "Materiales"],
  ["tools", "Herramientas"],
  ["plans", "Planes", "non-admin"],
  ["users", "Usuarios", "admin"],
  ["payments", "Pagos", "admin"],
  ["comments", "Comentarios"],
  ["profile", "Perfil"],
];

export function AppShell({ currentRoute, theme, onThemeChange, isAdmin = false, pendingPaymentCount = 0 }) {
  const isDark = theme === "dark";
  const visibleNavItems = navItems.filter(([, , scope]) => {
    if (scope === "admin") return isAdmin;
    if (scope === "non-admin") return !isAdmin;
    return true;
  });

  return (
    <header className="app-shell">
      <a className="brand" href="#landing" aria-label="Synapse Academia">
        <img className="brand-logo" src={logoUrl} alt="" aria-hidden="true" />
        <span>
          <strong>Synapse Academia</strong>
          <small>Estudio universitario premium</small>
        </span>
      </a>

      <nav className="nav-tabs" aria-label="Vistas principales">
        {visibleNavItems.map(([route, label]) => (
          <a key={route} href={`#${route}`} data-route={route} className={currentRoute === route ? "is-active" : ""}>
            <span>{label}</span>
            {route === "payments" && pendingPaymentCount > 0 && (
              <strong className="nav-notification-badge">{pendingPaymentCount}</strong>
            )}
          </a>
        ))}
      </nav>

      <button
        className="theme-toggle"
        type="button"
        aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        aria-pressed={isDark}
        title={isDark ? "Modo claro" : "Modo oscuro"}
        onClick={() => onThemeChange?.(isDark ? "light" : "dark")}
      >
        <span className="theme-toggle-track" aria-hidden="true">
          <span className="theme-toggle-thumb">
            <span className="theme-toggle-sun" />
            <span className="theme-toggle-moon" />
          </span>
        </span>
      </button>
    </header>
  );
}
