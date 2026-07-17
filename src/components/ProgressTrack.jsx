export function ProgressTrack({ value }) {
  return (
    <div className="progress-track" aria-label={`Progreso ${value}%`}>
      <span style={{ width: `${Number(value)}%` }} />
    </div>
  );
}
