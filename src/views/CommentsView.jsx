import { useState } from "react";
import { createPortal } from "react-dom";

const REPORT_REASONS = [
  "Contenido ofensivo o irrespetuoso",
  "Spam o publicidad",
  "Acoso o ataque personal",
  "Informacion falsa o confusa",
  "Pedido fuera de lugar",
  "Otro",
];

export function CommentsView({
  comments = [],
  reports = [],
  currentUser,
  canModerate = false,
  remoteStatus,
  onCreateComment,
  onToggleLike,
  onEditComment,
  onDeleteComment,
  onReportComment,
  onResolveReport,
}) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [body, setBody] = useState("");
  const [replyBodyById, setReplyBodyById] = useState({});
  const [replyingTo, setReplyingTo] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingBody, setEditingBody] = useState("");
  const [deletingComment, setDeletingComment] = useState(null);
  const [deletingReportComment, setDeletingReportComment] = useState(null);
  const [reportingComment, setReportingComment] = useState(null);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportDetails, setReportDetails] = useState("");
  const [reportsOpen, setReportsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submitComment(event) {
    event.preventDefault();
    setError("");
    try {
      setBusy(true);
      await onCreateComment?.({ body });
      setBody("");
      setComposerOpen(false);
    } catch (commentError) {
      setError(commentError?.message ?? "No se pudo publicar el comentario.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReply(event, parentId) {
    event.preventDefault();
    setError("");
    const replyBody = replyBodyById[parentId] ?? "";
    try {
      setBusy(true);
      await onCreateComment?.({ body: replyBody, parentId });
      setReplyBodyById((current) => ({ ...current, [parentId]: "" }));
      setReplyingTo("");
    } catch (commentError) {
      setError(commentError?.message ?? "No se pudo publicar la respuesta.");
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit(event, comment) {
    event.preventDefault();
    setError("");
    try {
      setBusy(true);
      await onEditComment?.({ ...comment, body: editingBody });
      setEditingId("");
      setEditingBody("");
    } catch (commentError) {
      setError(commentError?.message ?? "No se pudo editar el comentario.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteComment() {
    if (!deletingComment) return;
    setError("");
    try {
      setBusy(true);
      await onDeleteComment?.(deletingComment);
      setDeletingComment(null);
    } catch (commentError) {
      setError(commentError?.message ?? "No se pudo borrar el comentario.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteReportedComment() {
    if (!deletingReportComment) return;
    setError("");
    try {
      setBusy(true);
      await onResolveReport?.({ comment: deletingReportComment, action: "delete" });
      setDeletingReportComment(null);
    } catch (commentError) {
      setError(commentError?.message ?? "No se pudo resolver la denuncia.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReport(event) {
    event.preventDefault();
    if (!reportingComment) return;
    setError("");
    try {
      setBusy(true);
      await onReportComment?.({ comment: reportingComment, reason: reportReason, details: reportDetails });
      setReportingComment(null);
      setReportReason(REPORT_REASONS[0]);
      setReportDetails("");
    } catch (commentError) {
      setError(userFacingError(commentError, "No se pudo enviar la denuncia."));
    } finally {
      setBusy(false);
    }
  }

  async function resolveReport(comment, action) {
    setError("");
    try {
      setBusy(true);
      await onResolveReport?.({ comment, action });
    } catch (commentError) {
      setError(commentError?.message ?? "No se pudo resolver la denuncia.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="workspace comments-workspace">
      <div className="workspace-header">
        <div className="materials-heading-copy">
          <p className="eyebrow">Comunidad Synapse</p>
          <h1>Comentarios</h1>
          <p>Comparte mejoras para la app, pide nuevos materiales o responde ideas de otros estudiantes.</p>
        </div>
        <div className="comments-header-actions">
          <div className="cache-note material-status-note">{remoteStatus}</div>
          {canModerate && (
            <button className={reportsOpen ? "secondary-action comments-reports-button is-active" : "secondary-action comments-reports-button"} type="button" onClick={() => setReportsOpen((current) => !current)}>
              {reportsOpen ? "General" : "Denuncias"}
              {!reportsOpen && reports.length > 0 && <span>{reports.length}</span>}
            </button>
          )}
          <button className="primary-action" type="button" onClick={() => setComposerOpen(true)}>
            Añadir un comentario
          </button>
        </div>
      </div>

      {canModerate && reportsOpen ? (
        <ReportsPanel reports={reports} busy={busy} error={error} onResolve={resolveReport} onDeleteRequest={setDeletingReportComment} />
      ) : (
        <section className="comments-layout">
          <div className="comments-feed" aria-live="polite">
            {comments.length === 0 && (
              <article className="comments-empty">
                <h3>Todavía no hay comentarios</h3>
                <p>Sé la primera persona en pedir un material o proponer una mejora.</p>
              </article>
            )}
            {comments.map((comment) => (
              <CommentThread
                key={comment._id}
                comment={comment}
                currentUser={currentUser}
                replyingTo={replyingTo}
                replyBodyById={replyBodyById}
                busy={busy}
                onReplyToggle={(commentId) => setReplyingTo((current) => (current === commentId ? "" : commentId))}
                onReplyChange={(commentId, nextBody) => setReplyBodyById((current) => ({ ...current, [commentId]: nextBody }))}
                onReplySubmit={submitReply}
                onToggleLike={onToggleLike}
                canModerate={canModerate}
                editingId={editingId}
                editingBody={editingBody}
                onEditStart={(item) => {
                  setEditingId(item._id);
                  setEditingBody(item.body);
                }}
                onEditCancel={() => {
                  setEditingId("");
                  setEditingBody("");
                }}
                onEditChange={setEditingBody}
                onEditSubmit={submitEdit}
                onDelete={setDeletingComment}
                onReport={setReportingComment}
              />
            ))}
          </div>
        </section>
      )}

      {composerOpen && createPortal(
        <CommentComposerModal
          body={body}
          busy={busy}
          error={error}
          onBodyChange={setBody}
          onSubmit={submitComment}
          onClose={() => {
            setComposerOpen(false);
            setError("");
          }}
        />,
        document.body,
      )}
      {deletingComment && createPortal(
        <DeleteCommentModal
          busy={busy}
          error={error}
          hasReplies={hasNestedReplies(deletingComment)}
          onCancel={() => {
            setDeletingComment(null);
            setError("");
          }}
          onConfirm={confirmDeleteComment}
        />,
        document.body,
      )}
      {deletingReportComment && createPortal(
        <DeleteCommentModal
          busy={busy}
          error={error}
          hasReplies={hasNestedReplies(deletingReportComment)}
          onCancel={() => {
            setDeletingReportComment(null);
            setError("");
          }}
          onConfirm={confirmDeleteReportedComment}
        />,
        document.body,
      )}
      {reportingComment && createPortal(
        <ReportCommentModal
          reason={reportReason}
          details={reportDetails}
          busy={busy}
          error={error}
          onReasonChange={setReportReason}
          onDetailsChange={setReportDetails}
          onSubmit={submitReport}
          onCancel={() => {
            setReportingComment(null);
            setError("");
          }}
        />,
        document.body,
      )}
    </section>
  );
}

function ReportsPanel({ reports, busy, error, onResolve, onDeleteRequest }) {
  return (
    <section className="comments-reports-panel" aria-label="Denuncias pendientes">
      <div className="comments-reports-head">
        <div>
          <span className="section-kicker">Denuncias</span>
          <h2>Comentarios reportados</h2>
        </div>
        <strong>{reports.length} pendientes</strong>
      </div>
      {reports.length === 0 ? (
        <p className="comments-reports-empty">No hay denuncias pendientes.</p>
      ) : (
        <div className="comments-reports-list">
          {reports.map((item) => (
            <article className="comment-report-card" key={item.comment._id}>
              <div>
                <div className="comment-meta">
                  <strong>{item.comment.authorName ?? item.comment.userEmail}</strong>
                  {item.comment.authorIsAdmin && <span className="comment-admin-badge" title="Administrador">Admin</span>}
                  <span>{item.reports.length} denuncia{item.reports.length === 1 ? "" : "s"}</span>
                </div>
                <p>{item.comment.body}</p>
              </div>
              <div className="comment-report-details-list" aria-label="Detalle de denuncias">
                {item.reports.map((report) => (
                  <div className="comment-report-detail" key={report._id}>
                    <div>
                      <strong>{report.reason}</strong>
                      <time dateTime={new Date(report.createdAt).toISOString()}>{formatDate(report.createdAt)}</time>
                    </div>
                    <span>Denunció: <b>{report.reporterName ?? report.reporterEmail}</b>{report.reporterName ? ` · ${report.reporterEmail}` : ""}</span>
                    {report.details && <p>{report.details}</p>}
                  </div>
                ))}
              </div>
              <div className="comment-report-actions">
                <button className="secondary-action" type="button" disabled={busy} onClick={() => onResolve(item.comment, "dismiss")}>
                  Dejarlo tranquilo
                </button>
                <button className="primary-action comment-confirm-delete" type="button" disabled={busy} onClick={() => onDeleteRequest(item.comment)}>
                  Borrar comentario
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {error && <p className="auth-error">{error}</p>}
    </section>
  );
}

function ReportCommentModal({ reason, details, busy, error, onReasonChange, onDetailsChange, onSubmit, onCancel }) {
  const [reasonOpen, setReasonOpen] = useState(false);

  return (
    <div className="course-detail-overlay is-visible" role="dialog" aria-modal="true">
      <section className="course-detail-modal comment-modal">
        <header>
          <div>
            <h2>Denunciar comentario</h2>
            <span>Selecciona el motivo para que un admin lo revise.</span>
          </div>
          <button className="quiet-button" type="button" onClick={onCancel}>Cerrar</button>
        </header>
        <form className="comment-composer comment-composer-modal" onSubmit={onSubmit}>
          <label className="comment-report-field">
            Motivo
            <div className={reasonOpen ? "custom-select comment-report-select is-open" : "custom-select comment-report-select"}>
              <button
                className="custom-select-trigger"
                type="button"
                aria-haspopup="listbox"
                aria-expanded={reasonOpen}
                onClick={() => setReasonOpen((current) => !current)}
              >
                <span className="custom-select-label">{reason}</span>
                <span className="custom-select-chevron" aria-hidden="true">⌄</span>
              </button>
              {reasonOpen && (
                <div className="custom-select-menu" role="listbox" tabIndex={-1} aria-label="Motivo de denuncia">
                  {REPORT_REASONS.map((item) => (
                    <button
                      className={item === reason ? "custom-select-option is-selected" : "custom-select-option"}
                      type="button"
                      role="option"
                      aria-selected={item === reason}
                      key={item}
                      onClick={() => {
                        onReasonChange(item);
                        setReasonOpen(false);
                      }}
                    >
                      <span className="custom-select-label">{item}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </label>
          <label className="comment-report-field">
            Detalle opcional
            <textarea
              value={details}
              onChange={(event) => onDetailsChange(event.target.value)}
              placeholder="Añade contexto si hace falta..."
              maxLength={500}
            />
          </label>
          <div className="comment-composer-footer">
            <span>{details.length}/500</span>
            <button className="primary-action" type="submit" disabled={busy}>
              {busy ? "Enviando..." : "Enviar denuncia"}
            </button>
          </div>
          {error && <p className="auth-error">{error}</p>}
        </form>
      </section>
    </div>
  );
}

function DeleteCommentModal({ busy, error, hasReplies, onCancel, onConfirm }) {
  return (
    <div className="course-detail-overlay is-visible" role="dialog" aria-modal="true">
      <section className="course-detail-modal comment-confirm-modal">
        <header>
          <div>
            <h2>Borrar comentario</h2>
            {hasReplies && <span>También se borrarán todas sus respuestas.</span>}
          </div>
        </header>
        <div className="comment-confirm-body">
          <p>Esta acción no se puede deshacer.</p>
          {error && <p className="auth-error">{error}</p>}
          <div className="comment-confirm-actions">
            <button className="secondary-action" type="button" onClick={onCancel} disabled={busy}>
              Cancelar
            </button>
            <button className="primary-action comment-confirm-delete" type="button" onClick={onConfirm} disabled={busy}>
              {busy ? "Borrando..." : "Borrar comentario"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function CommentComposerModal({ body, busy, error, onBodyChange, onSubmit, onClose }) {
  return (
    <div className="course-detail-overlay is-visible" role="dialog" aria-modal="true">
      <section className="course-detail-modal comment-modal">
        <header>
          <div>
            <h2>Añadir un comentario</h2>
            <span>Mejoras, pedidos de materiales o ideas para Synapse</span>
          </div>
          <button className="quiet-button" type="button" onClick={onClose}>Cerrar</button>
        </header>
        <form className="comment-composer comment-composer-modal" onSubmit={onSubmit}>
          <div>
            <span className="section-kicker">Nuevo comentario</span>
            <h2>Cuéntanos qué necesitas</h2>
          </div>
          <textarea
            value={body}
            onChange={(event) => onBodyChange(event.target.value)}
            placeholder="Ejemplo: Me gustaría un cuaderno de ejercicios de Matemática II..."
            maxLength={1200}
            required
            autoFocus
          />
          <div className="comment-composer-footer">
            <span>{body.length}/1200</span>
            <button className="primary-action" type="submit" disabled={busy || body.trim().length < 3}>
              {busy ? "Publicando..." : "Publicar comentario"}
            </button>
          </div>
          {error && <p className="auth-error">{error}</p>}
        </form>
      </section>
    </div>
  );
}

function CommentThread({
  comment,
  currentUser,
  canModerate,
  replyingTo,
  replyBodyById,
  busy,
  editingId,
  editingBody,
  onReplyToggle,
  onReplyChange,
  onReplySubmit,
  onToggleLike,
  onEditStart,
  onEditCancel,
  onEditChange,
  onEditSubmit,
  onDelete,
  onReport,
  isNested = false,
}) {
  return (
    <article className={isNested ? "comment-card is-nested" : "comment-card"}>
      <CommentBody
        comment={comment}
        currentUser={currentUser}
        canModerate={canModerate}
        busy={busy}
        editingId={editingId}
        editingBody={editingBody}
        onReplyToggle={() => onReplyToggle(comment._id)}
        onToggleLike={onToggleLike}
        onEditStart={onEditStart}
        onEditCancel={onEditCancel}
        onEditChange={onEditChange}
        onEditSubmit={onEditSubmit}
        onDelete={onDelete}
        onReport={onReport}
        isNested={isNested}
      />

      {replyingTo === comment._id && (
        <form className="comment-reply-form" onSubmit={(event) => onReplySubmit(event, comment._id)}>
          <textarea
            value={replyBodyById[comment._id] ?? ""}
            onChange={(event) => onReplyChange(comment._id, event.target.value)}
            placeholder="Escribe una respuesta..."
            maxLength={1200}
            required
          />
          <div className="comment-composer-footer">
            <span>{(replyBodyById[comment._id] ?? "").length}/1200</span>
            <button className="secondary-action" type="submit" disabled={busy || (replyBodyById[comment._id] ?? "").trim().length < 3}>
              Responder
            </button>
          </div>
        </form>
      )}

      {comment.replies?.length > 0 && (
        <div className="comment-replies">
          {comment.replies.map((reply) => (
            <CommentThread
              key={reply._id}
              comment={reply}
              currentUser={currentUser}
              canModerate={canModerate}
              busy={busy}
              replyingTo={replyingTo}
              replyBodyById={replyBodyById}
              editingId={editingId}
              editingBody={editingBody}
              onReplyToggle={onReplyToggle}
              onReplyChange={onReplyChange}
              onReplySubmit={onReplySubmit}
              onToggleLike={onToggleLike}
              onEditStart={onEditStart}
              onEditCancel={onEditCancel}
              onEditChange={onEditChange}
              onEditSubmit={onEditSubmit}
              onDelete={onDelete}
              onReport={onReport}
              isNested
            />
          ))}
        </div>
      )}
    </article>
  );
}

function CommentBody({
  comment,
  currentUser,
  canModerate,
  busy,
  editingId,
  editingBody,
  onReplyToggle,
  onToggleLike,
  onEditStart,
  onEditCancel,
  onEditChange,
  onEditSubmit,
  onDelete,
  onReport,
  isNested = false,
}) {
  const mine = currentUser?.email?.toLowerCase() === comment.userEmail?.toLowerCase();
  const canEdit = mine;
  const canDelete = mine || canModerate;
  const canReport = !mine && !canModerate;
  const isEditing = editingId === comment._id;

  return (
    <div className={isNested ? "comment-body is-reply" : "comment-body"}>
      <div className="comment-avatar" aria-hidden="true">{initials(comment.authorName ?? comment.userEmail)}</div>
      <div className="comment-content">
        <div className="comment-meta">
          <strong>{comment.authorName ?? comment.userEmail}</strong>
          {comment.authorIsAdmin && <span className="comment-admin-badge" title="Administrador">Admin</span>}
          {mine && <span>Tu comentario</span>}
          <time dateTime={new Date(comment.createdAt).toISOString()}>{formatDate(comment.createdAt)}</time>
        </div>
        {isEditing ? (
          <form className="comment-edit-form" onSubmit={(event) => onEditSubmit(event, comment)}>
            <textarea
              value={editingBody}
              onChange={(event) => onEditChange(event.target.value)}
              maxLength={1200}
              required
              autoFocus
            />
            <div className="comment-composer-footer">
              <span>{editingBody.length}/1200</span>
              <div className="comment-inline-actions">
                <button className="small-action" type="button" onClick={onEditCancel}>Cancelar</button>
                <button className="small-action is-saved" type="submit" disabled={busy || editingBody.trim().length < 3}>Guardar</button>
              </div>
            </div>
          </form>
        ) : (
          <p>{comment.body}</p>
        )}
        <div className="comment-actions">
          <button
            className={comment.likedByMe ? "comment-like-button is-liked" : "comment-like-button"}
            type="button"
            aria-pressed={comment.likedByMe}
            onClick={() => onToggleLike?.(comment)}
          >
            <span aria-hidden="true">♥</span>
            <strong>Me gusta</strong>
            <em>{comment.likeCount ?? 0}</em>
          </button>
          <button className="small-action" type="button" onClick={onReplyToggle}>
            Responder
          </button>
          {canEdit && !isEditing && (
            <button className="small-action" type="button" onClick={() => onEditStart(comment)}>
              Editar
            </button>
          )}
          {canDelete && (
            <button className="small-action comment-danger-action" type="button" onClick={() => onDelete(comment)}>
              Borrar
            </button>
          )}
          {canReport && (
            <button className={comment.reportedByMe ? "small-action is-saved" : "small-action"} type="button" disabled={comment.reportedByMe} onClick={() => onReport(comment)}>
              {comment.reportedByMe ? "Denunciado" : "Denunciar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function initials(value) {
  return String(value ?? "U")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function hasNestedReplies(comment) {
  return Array.isArray(comment?.replies) && comment.replies.length > 0;
}

function userFacingError(error, fallback) {
  const message = error?.message ?? fallback;
  const serverMessage = message.match(/Server Error\s+(.+?)(?:\s+at handler|\s+Called by client|$)/)?.[1];
  return serverMessage ?? message;
}
