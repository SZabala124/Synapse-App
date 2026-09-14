import { useState } from "react";

const CONTACT_EMAIL = "synapseacademiateam@gmail.com";
const CONTACT_PHONE = "04242327486";

const DOCUMENTS = [
  {
    id: "privacy",
    label: "Datos y privacidad",
    title: "Datos y privacidad",
    paragraphs: [
      "Synapse Academia recopila datos como correo electrónico, nombre, apellido, cédula o carnet universitario y número telefónico. Estos datos se usan exclusivamente para crear y proteger la cuenta, evitar registros duplicados o fraudulentos, brindar soporte y mantener una comunidad segura.",
      "Los administradores no venderán, publicarán ni utilizarán estos datos para fines ajenos al funcionamiento de la plataforma. El acceso estará limitado a los administradores cuando sea necesario para resolver un problema técnico, una solicitud del usuario, una apelación o un incumplimiento grave de estos términos.",
      "En situaciones que involucren distribución no autorizada de contenido Premium, fraude, hostigamiento, spam, actividades ilícitas o daños contra Synapse Academia, sus usuarios o la universidad, los administradores podrán revisar la información estrictamente necesaria para investigar el caso y aplicar las medidas correspondientes.",
      `Para consultas, correcciones, reclamos o apelaciones relacionadas con una cuenta, puedes escribir a ${CONTACT_EMAIL} o comunicarte al ${CONTACT_PHONE}.`,
    ],
  },
  {
    id: "free-materials",
    label: "Materiales gratuitos",
    title: "Materiales gratuitos",
    paragraphs: [
      "Los materiales clasificados como gratuitos provienen de Drives académicos que han sido puestos a disposición de los estudiantes de determinadas carreras. Synapse Academia no reclama la propiedad de esos materiales ni reemplaza su fuente original.",
      "La plataforma organiza, clasifica y facilita la búsqueda de estos recursos para que los estudiantes puedan encontrarlos de forma más rápida y directa. Cuando corresponde, el acceso se realiza mediante el mismo enlace de Drive en el que el material ya se encuentra disponible.",
      "Synapse Academia actúa como una herramienta de organización y búsqueda académica. No se presenta como una plataforma oficial de la Universidad Metropolitana ni sustituye sus canales institucionales.",
    ],
  },
  {
    id: "premium",
    label: "Recursos Premium",
    title: "Recursos Premium y herramientas",
    paragraphs: [
      "Los materiales Pro y las herramientas de Synapse Academia son recursos desarrollados y mantenidos por los administradores de la plataforma. El acceso Premium es opcional y permite utilizar recursos adicionales como parte del servicio contratado.",
      "El pago concede una licencia personal, limitada y no transferible para acceder a estos recursos. No implica la compra de la propiedad intelectual de los materiales, herramientas, diseños, funciones o contenidos Premium.",
      "Está prohibido compartir, publicar, vender, redistribuir o divulgar fotos, capturas, extractos, archivos, enlaces privados o cualquier parte de los recursos Premium sin autorización previa de los administradores.",
    ],
  },
  {
    id: "academic-integrity",
    label: "Uso académico",
    title: "Uso académico responsable",
    paragraphs: [
      "Synapse Academia busca apoyar el aprendizaje, la preparación y la organización del estudio universitario. Los recursos de la plataforma no deben utilizarse para copiarse, suplantar trabajos, incumplir evaluaciones ni violar normas académicas o institucionales.",
      "Cada usuario es responsable del uso que dé a los materiales y herramientas. Synapse Academia promueve que cada estudiante aprenda de manera más eficiente y aproveche recursos que complementen las materias que ya cursa.",
    ],
  },
  {
    id: "conduct",
    label: "Normas y apelaciones",
    title: "Normas, sanciones y apelaciones",
    paragraphs: [
      "Se prohíbe compartir contenido Premium sin autorización, acosar o faltar el respeto a otros usuarios, publicar spam o publicidad no autorizada, intentar vulnerar la plataforma, crear cuentas duplicadas con fines indebidos o realizar actividades ilícitas contra Synapse Academia, sus usuarios o la universidad.",
      "Dependiendo de la gravedad del caso, Synapse Academia podrá aplicar advertencias, limitaciones temporales, suspensión de acceso o bloqueo definitivo de la cuenta. En situaciones que representen un riesgo para la comunidad, la cuenta podrá ser bloqueada preventivamente mientras se revisa el caso.",
      `Toda persona sancionada puede solicitar una revisión o apelación escribiendo a ${CONTACT_EMAIL} o contactando al ${CONTACT_PHONE}. La solicitud debe incluir el correo asociado a la cuenta, una explicación del caso y, cuando sea posible, evidencia relevante.`,
    ],
  },
  {
    id: "payments",
    label: "Pagos y reclamos",
    title: "Pagos, planes y reclamos",
    paragraphs: [
      "Synapse Academia ofrece planes Premium opcionales que habilitan recursos, materiales y herramientas adicionales. Los precios, períodos de acceso, descuentos aplicables y condiciones de cada plan se muestran antes de que el usuario reporte su pago.",
      "Los pagos realizados deben corresponder al monto indicado por la plataforma y contener datos válidos de la transferencia. La activación del plan se realiza una vez que un administrador verifica el pago reportado. Hasta ese momento, la solicitud permanecerá pendiente de revisión.",
      "Los descuentos, créditos por cambios de plan y recompensas por referidos se aplican según las condiciones mostradas al momento de solicitar el pago. Los descuentos acumulados pueden utilizarse hasta un máximo del 100 % en una compra; cualquier porcentaje restante se conservará para un pago posterior, cuando corresponda.",
      `Si se presenta un inconveniente con un pago, una activación, un descuento, un referido o un plan, puedes realizar un reclamo mediante ${CONTACT_EMAIL} o el número ${CONTACT_PHONE}. Para facilitar la revisión, indica el correo de tu cuenta, la fecha del pago, el plan solicitado y la referencia de la transferencia.`,
      "Synapse Academia revisará cada caso de buena fe y buscará resolverlo de manera razonable. La plataforma podrá solicitar información adicional cuando sea necesaria para verificar un pago o atender un reclamo.",
    ],
  },
];

export function LegalLinks({ className = "" }) {
  const [activeDocument, setActiveDocument] = useState(null);
  const active = DOCUMENTS.find((document) => document.id === activeDocument);

  return (
    <>
      <footer className={`legal-links ${className}`.trim()} aria-label="Documentos legales">
        <span>Synapse Academia</span>
        {DOCUMENTS.map((document) => (
          <button key={document.id} type="button" onClick={() => setActiveDocument(document.id)}>
            {document.label}
          </button>
        ))}
      </footer>
      {active && <LegalDocumentModal document={active} onClose={() => setActiveDocument(null)} />}
    </>
  );
}

export function SignupTermsModal({ onClose, onAccept }) {
  const [accepted, setAccepted] = useState(false);
  const [activeDocument, setActiveDocument] = useState(null);
  const active = DOCUMENTS.find((document) => document.id === activeDocument);

  return (
    <div className="legal-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="signup-terms-title">
      <section className="legal-modal">
        {active ? (
          <LegalDocumentContent document={active} onBack={() => setActiveDocument(null)} onClose={onClose} />
        ) : (
          <>
            <header className="legal-modal-header">
              <div>
                <p className="eyebrow">Antes de crear tu cuenta</p>
                <h2 id="signup-terms-title">Términos de uso</h2>
              </div>
              <button className="quiet-button" type="button" onClick={onClose}>Cerrar</button>
            </header>
            <div className="legal-modal-body">
              <p>
                Al continuar, confirmas que leíste y aceptas los Términos de uso y la Política de privacidad de Synapse Academia.
              </p>
              <p>
                Usamos tus datos únicamente para crear y proteger tu cuenta, evitar registros duplicados, brindar soporte y atender incumplimientos graves de las normas de la plataforma.
              </p>
              <p>
                Synapse organiza materiales académicos gratuitos ya disponibles en Drives estudiantiles y ofrece recursos Premium de uso personal. No se permite redistribuir contenido Premium sin autorización.
              </p>
              <div className="legal-document-list">
                {DOCUMENTS.map((document) => (
                  <button key={document.id} className="legal-document-link" type="button" onClick={() => setActiveDocument(document.id)}>
                    {document.label}
                  </button>
                ))}
              </div>
              <label className="legal-acceptance">
                <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
                <span>He leído y acepto los Términos de uso y la Política de privacidad.</span>
              </label>
              <div className="legal-modal-actions">
                <button className="secondary-action" type="button" onClick={onClose}>Cancelar</button>
                <button className="primary-action" type="button" disabled={!accepted} onClick={onAccept}>Aceptar y crear cuenta</button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function LegalDocumentModal({ document, onClose }) {
  return (
    <div className="legal-modal-overlay" role="dialog" aria-modal="true" aria-labelledby={`legal-${document.id}`}>
      <section className="legal-modal">
        <LegalDocumentContent document={document} onClose={onClose} />
      </section>
    </div>
  );
}

function LegalDocumentContent({ document, onBack, onClose }) {
  return (
    <>
      <header className="legal-modal-header">
        <div>
          <p className="eyebrow">Synapse Academia</p>
          <h2 id={`legal-${document.id}`}>{document.title}</h2>
        </div>
        <button className="quiet-button" type="button" onClick={onClose}>Cerrar</button>
      </header>
      <div className="legal-modal-body legal-document-content">
        {document.paragraphs.map((paragraph) => <p key={paragraph}>{highlightContactDetails(paragraph)}</p>)}
        {onBack && <button className="secondary-action legal-back-button" type="button" onClick={onBack}>Volver a los términos</button>}
      </div>
    </>
  );
}

function highlightContactDetails(text) {
  const contactPattern = /(synapseacademiateam@gmail\.com|04242327486)/g;
  return String(text).split(contactPattern).map((part, index) => (
    part === CONTACT_EMAIL || part === CONTACT_PHONE
      ? <span className="legal-contact-detail" key={`${part}-${index}`}>{part}</span>
      : part
  ));
}
