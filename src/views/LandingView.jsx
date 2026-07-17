export function LandingView() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <h1>Synapse Academia</h1>
          <p className="hero-text">
            Un escritorio universitario premium para curar materiales y visualizar el avance academico con disciplina
            profesional.
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="#career">Abrir flujograma</a>
            <a className="secondary-action" href="#materials">Explorar biblioteca</a>
          </div>
        </div>
      </section>

      <section className="section-band intro-grid">
        <article>
          <h2>Planificacion serena para semanas exigentes.</h2>
          <p>
            La app organiza materias y recursos alrededor de decisiones concretas: que estudiar, que material guardar y
            como avanzar en el flujograma.
          </p>
        </article>
      </section>

      <section className="section-band feature-strip" aria-label="Vistas disponibles">
        <a href="#career">
          <span>01</span>
          <strong>Flujograma</strong>
          <small>Trimestres o semestres, creditos, estado y notas.</small>
        </a>
        <a href="#materials">
          <span>02</span>
          <strong>Materiales</strong>
          <small>PDF, presentaciones, videos, guias y resumenes curados.</small>
        </a>
      </section>
    </>
  );
}
