import { useEffect, useRef, useState } from "react";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const menuCloseTimerRef = useRef(null);
  const visibleNavItems = navItems.filter(([, , scope]) => {
    if (scope === "admin") return isAdmin;
    if (scope === "non-admin") return !isAdmin;
    return true;
  });

  function clearMenuCloseTimer() {
    if (!menuCloseTimerRef.current) return;
    window.clearTimeout(menuCloseTimerRef.current);
    menuCloseTimerRef.current = null;
  }

  function openMenu() {
    clearMenuCloseTimer();
    setMenuMounted(true);
    window.requestAnimationFrame(() => setMenuOpen(true));
  }

  function closeMenu() {
    clearMenuCloseTimer();
    setMenuOpen(false);
    menuCloseTimerRef.current = window.setTimeout(() => {
      setMenuMounted(false);
      menuCloseTimerRef.current = null;
    }, 280);
  }

  function toggleMenu() {
    if (menuOpen) {
      closeMenu();
      return;
    }
    openMenu();
  }

  useEffect(() => {
    if (menuMounted || menuOpen) closeMenu();
  }, [currentRoute]);

  useEffect(() => () => clearMenuCloseTimer(), []);

  return (
    <header className={menuOpen ? "app-shell is-menu-open" : "app-shell"}>
      <a className="brand" href="#landing" aria-label="Synapse Academia">
        <img className="brand-logo" src={logoUrl} alt="" aria-hidden="true" />
        <span>
          <strong>Synapse Academia</strong>
          <small>Estudio universitario premium</small>
        </span>
      </a>

      <button
        className="mobile-menu-button"
        type="button"
        aria-label={menuOpen ? "Cerrar menu" : "Abrir menu"}
        aria-expanded={menuOpen}
        aria-controls="primary-navigation"
        onClick={toggleMenu}
      >
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </button>

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

      <nav
        id="primary-navigation"
        className={menuOpen ? "mobile-nav-menu is-visible" : "mobile-nav-menu"}
        aria-label="Vistas principales moviles"
        aria-hidden={!menuMounted || !menuOpen}
      >
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
