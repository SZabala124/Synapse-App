export function ToolMetaTags({ subject = "Matematica Basica", topic }) {
  return (
    <div className="tool-modal-tags" aria-label="Datos de la herramienta">
      <span className="tool-modal-tag tool-modal-tag-subject">{subject}</span>
      {topic && <span className="tool-modal-tag tool-modal-tag-topic">{topic}</span>}
    </div>
  );
}
