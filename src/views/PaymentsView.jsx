import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const statusOptions = [
  { value: "pending", label: "Pendientes" },
  { value: "approved", label: "Aprobados" },
  { value: "rejected", label: "Rechazados" },
  { value: "all", label: "Todos" },
];

export function PaymentsView({ adminEmail }) {
  const [status, setStatus] = useState("pending");
  const [confirming, setConfirming] = useState(null);
  const payments = useQuery(api.payments.listForAdmin, { adminEmail, status }) ?? [];
  const approvePayment = useMutation(api.payments.approve);
  const rejectPayment = useMutation(api.payments.reject);

  async function resolvePayment(action, payment) {
    if (action === "approve") {
      await approvePayment({ adminEmail, paymentId: payment._id });
    } else {
      await rejectPayment({ adminEmail, paymentId: payment._id });
    }
    setConfirming(null);
  }

  return (
    <section className="workspace payments-workspace">
      <div className="workspace-header payments-header">
        <div className="materials-heading-copy">
          <p className="eyebrow">Administracion</p>
          <h1>Pagos</h1>
          <p>Verifica los reportes de pago movil y activa manualmente el plan del usuario cuando coincidan con tu app bancaria.</p>
        </div>
        <div className="payments-filter">
          <span>Estado</span>
          <PaymentStatusSelect value={status} onChange={setStatus} />
        </div>
      </div>

      <section className="payments-list" aria-label="Solicitudes de pago">
        {payments.length === 0 && (
          <article className="material-empty-state">
            <h3>No hay pagos con este filtro</h3>
            <p>Cuando un usuario reporte un pago movil, aparecera aqui para revision.</p>
          </article>
        )}
        {payments.map((payment) => (
          <article className="payment-admin-card" key={payment._id}>
            <div className="payment-admin-main">
              <div>
                <span className={payment.status === "pending" ? "payment-status is-pending" : `payment-status is-${payment.status}`}>
                  {statusLabel(payment.status)}
                </span>
                <h2>{planLabel(payment.plan)} · {payment.billingPeriod === "quarterly" ? "Trimestral" : "Mensual"}</h2>
                <p>{payment.userName || payment.userEmail}</p>
              </div>
              <strong>Bs {formatBs(payment.amountBs)}</strong>
            </div>
            <dl className="payment-admin-details">
              <div><dt>Fecha y hora</dt><dd>{formatDateTime(payment.createdAt)}</dd></div>
              <div><dt>Correo</dt><dd>{payment.userEmail}</dd></div>
              <div><dt>Monto USD</dt><dd>${payment.amountUsd}</dd></div>
              <div><dt>Tasa BCV</dt><dd>{payment.bcvRate ? `Bs ${formatBs(payment.bcvRate)}` : "No registrada"}</dd></div>
              <div><dt>Telefono</dt><dd>{payment.payerPhone}</dd></div>
              <div><dt>Banco</dt><dd>{payment.bankName} ({payment.bankCode})</dd></div>
              <div><dt>Referencia</dt><dd>**** {payment.referenceLast4}</dd></div>
              {payment.resolvedAt && <div><dt>Resuelto</dt><dd>{formatDateTime(payment.resolvedAt)}</dd></div>}
            </dl>
            {payment.status === "pending" && (
              <div className="payment-admin-actions">
                <button className="secondary-action" type="button" onClick={() => setConfirming({ action: "reject", payment })}>
                  Rechazar
                </button>
                <button className="primary-action" type="button" onClick={() => setConfirming({ action: "approve", payment })}>
                  Aceptar pago
                </button>
              </div>
            )}
          </article>
        ))}
      </section>

      {confirming && (
        <PaymentResolveModal
          data={confirming}
          onCancel={() => setConfirming(null)}
          onConfirm={() => resolvePayment(confirming.action, confirming.payment)}
        />
      )}
    </section>
  );
}

function PaymentStatusSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = statusOptions.find((option) => option.value === value) ?? statusOptions[0];

  function selectStatus(nextValue) {
    onChange?.(nextValue);
    setOpen(false);
  }

  return (
    <div className={open ? "custom-select payment-status-select is-open" : "custom-select payment-status-select"}>
      <button
        className="custom-select-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filtrar pagos por estado"
        onClick={() => setOpen((current) => !current)}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        <span className="custom-select-label">{selected.label}</span>
        <span className="custom-select-chevron" aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="custom-select-menu" role="listbox" tabIndex={-1} aria-label="Estados de pago">
          {statusOptions.map((option) => (
            <button
              className={option.value === selected.value ? "custom-select-option is-selected" : "custom-select-option"}
              type="button"
              role="option"
              aria-selected={option.value === selected.value}
              key={option.value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectStatus(option.value)}
            >
              <span className="custom-select-label">{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PaymentResolveModal({ data, onCancel, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const isApproval = data.action === "approve";

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="course-detail-overlay is-visible" role="dialog" aria-modal="true">
      <section className="course-detail-modal payment-resolve-modal">
        <header>
          <div>
            <p className="eyebrow">Confirmacion requerida</p>
            <h2>{isApproval ? "Aceptar pago" : "Rechazar pago"}</h2>
            <span>{data.payment.userEmail}</span>
          </div>
        </header>
        <div className="course-detail-body">
          <p>
            {isApproval
              ? `Esto activara el plan ${planLabel(data.payment.plan)} para el usuario.`
              : "Esto marcara la solicitud como rechazada y no cambiara el plan del usuario."}
          </p>
          <div className="profile-actions">
            <button className="quiet-button" type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
            <button className={isApproval ? "primary-action" : "primary-action danger-primary"} type="button" onClick={handleConfirm} disabled={busy}>
              {busy ? "Procesando..." : isApproval ? "Aceptar pago" : "Rechazar pago"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function statusLabel(status) {
  if (status === "approved") return "Aprobado";
  if (status === "rejected") return "Rechazado";
  return "Pendiente";
}

function planLabel(plan) {
  return plan === "excellence" ? "Excellence" : "Pro";
}

function formatDateTime(timestamp) {
  return new Date(timestamp).toLocaleString("es-VE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatBs(value) {
  return Number(value ?? 0).toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
