import logoUrl from "../../Synapse.svg";
import { LegalLinks } from "../components/LegalDocuments";

export function PublicLanding({ onAuthClick }) {
  return (
    <main className="public-landing">
      <header className="public-nav">
        <a className="brand" href="#landing" aria-label="Synapse Academia">
          <img className="brand-logo" src={logoUrl} alt="" aria-hidden="true" />
          <span>
            <strong>Synapse Academia</strong>
            <small>Material académico premium</small>
          </span>
        </a>
        <button className="secondary-action public-login-button" type="button" onClick={() => onAuthClick("signIn")}>
          Iniciar sesión
        </button>
      </header>

      <section className="public-hero">
        <div className="public-hero-copy">
          <p className="eyebrow">Biblioteca académica inteligente</p>
          <h1>Materiales de estudio premium en pocos minutos.</h1>
          <p>
            Encuentra guías, PDFs, presentaciones y videos curados para estudiar mejor, preparar evaluaciones y elevar
            tu calidad académica sin perder tiempo buscando en todas partes.
          </p>
        </div>

        <aside className="document-merge-visual" aria-label="Documentos academicos organizandose">
          <div className="paper-sheet sheet-a">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div className="paper-sheet sheet-b">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div className="paper-sheet sheet-c">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div className="paper-stack-label">
            <strong>Materiales listos</strong>
            <small>Guías, clases y evaluaciones en un solo lugar.</small>
          </div>
        </aside>
      </section>

      <section className="public-material-strip" aria-label="Tipos de materiales">
        <article>
          <span className="format-pill level-pro">PDF</span>
          <strong>Guías premium</strong>
          <small>Documentos, ejercicios resueltos y resúmenes listos para repasar.</small>
        </article>
        <article>
          <span className="format-pill level-avanzado">Video</span>
          <strong>Clases enfocadas</strong>
          <small>Explicaciones para entender temas complejos con más claridad.</small>
        </article>
        <article>
          <span className="format-pill level-gratis">Archivo</span>
          <strong>Evaluaciones viejas</strong>
          <small>Parciales, prácticas y modelos anteriores para prepararte con criterio.</small>
        </article>
      </section>

      <section className="public-auth-strip" aria-label="Acceso a Synapse">
        <div>
          <span className="section-kicker">Empieza ahora</span>
          <h2>Crea tu biblioteca académica en minutos.</h2>
          <p>Guarda materiales, filtra por materia y vuelve a lo importante cuando necesites estudiar.</p>
        </div>
        <div className="hero-actions">
          <button className="primary-action" type="button" onClick={() => onAuthClick("signUp")}>
            Crear cuenta gratis
          </button>
          <button className="secondary-action" type="button" onClick={() => onAuthClick("signIn")}>
            Ya tengo cuenta
          </button>
        </div>
      </section>
      <LegalLinks className="public-legal-links" />
    </main>
  );
}
