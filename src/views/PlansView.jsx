import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const PAYMENT_TARGET = {
  nationalId: "31460195",
  phone: "04242327486",
  displayPhone: "0424-2327486",
  bank: "Mercantil (0105)",
};

const plans = [
  {
    id: "free",
    name: "Gratis",
    monthly: 0,
    quarterly: 0,
    badge: "Para empezar",
    description: "Acceso controlado para probar Synapse sin pagar.",
    features: [
      "Materiales gratis ilimitados",
      "3 materiales Pro al mes",
      "Hasta 7 materias seleccionadas por trimestre",
      "Sin acceso a herramientas",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthly: 3,
    quarterly: 6,
    badge: "Trimestral con 1 mes de ahorro",
    description: "Para estudiar con materiales Pro sin fricción.",
    features: [
      "Materiales gratis y Pro sin limites",
      "Todas las materias de tu carrera",
      "Lista completa de herramientas de tu carrera",
      "3 herramientas al mes",
    ],
    highlighted: true,
  },
  {
    id: "excellence",
    name: "Excellence",
    monthly: 4,
    quarterly: 8,
    badge: "Trimestral con 1 mes de ahorro",
    description: "Todo Synapse desbloqueado para estudiar a fondo.",
    features: [
      "Todo lo incluido en Pro",
      "Herramientas ilimitadas de tu carrera",
      "Sin limites mensuales de uso academico",
      "Ideal para parciales, guias y practica intensiva",
    ],
  },
];

export function PlansView({ currentUser, currentPlan = "free", isAdmin = false, pendingPayment = null }) {
  const [paymentDraft, setPaymentDraft] = useState(null);
  const normalizedPlan = isAdmin ? "admin" : currentPlan;

  return (
    <section className="workspace plans-workspace">
      <div className="workspace-header plans-header">
        <div className="materials-heading-copy">
          <p className="eyebrow">Planes Synapse</p>
          <h1>Escoge cómo quieres estudiar</h1>
          <p>Completa el pago movil y un administrador verificara la transferencia para activar tu plan.</p>
        </div>
        <div className="plans-current-card">
          <span>Plan actual</span>
          <strong>{isAdmin ? "Admin" : planLabel(currentPlan)}</strong>
          {pendingPayment && <small>Pago pendiente de verificacion</small>}
        </div>
      </div>

      <section className="plans-grid" aria-label="Planes disponibles">
        {plans.map((plan) => (
          <article className={plan.highlighted ? "plan-card is-highlighted" : "plan-card"} key={plan.id}>
            <div className="plan-card-head">
              <span className="format-pill">{plan.badge}</span>
              <h2>{plan.name}</h2>
              <p>{plan.description}</p>
            </div>
            <div className="plan-price-row">
              <div>
                <span>Mensual</span>
                <strong>{formatUsd(plan.monthly)}</strong>
                <small>/ mes</small>
              </div>
              <div>
                <span>Trimestral</span>
                <strong>{formatUsd(plan.quarterly)}</strong>
                <small>/ 3 meses</small>
              </div>
            </div>
            <ul className="plan-feature-list">
              {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
            <div className="plan-action-group">
              {plan.id === "free" || normalizedPlan === plan.id ? (
                <button className="primary-action plan-action" type="button" disabled>
                  {normalizedPlan === plan.id ? "Plan activo" : "Incluido"}
                </button>
              ) : (
                <>
                  <button
                    className="secondary-action plan-pay-action"
                    type="button"
                    disabled={isAdmin || Boolean(pendingPayment)}
                    onClick={() => setPaymentDraft({ plan, billingPeriod: "monthly", amountUsd: plan.monthly })}
                  >
                    Pagar mensual
                  </button>
                  <button
                    className="primary-action plan-pay-action"
                    type="button"
                    disabled={isAdmin || Boolean(pendingPayment)}
                    onClick={() => setPaymentDraft({ plan, billingPeriod: "quarterly", amountUsd: plan.quarterly })}
                  >
                    Pagar trimestral
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </section>

      {pendingPayment && (
        <section className="payment-pending-banner">
          <div>
            <p className="eyebrow">Pago pendiente</p>
            <h2>{planLabel(pendingPayment.plan)} {pendingPayment.billingPeriod === "quarterly" ? "trimestral" : "mensual"}</h2>
            <p>Tu reporte de pago movil fue enviado. Cuando el admin lo apruebe, tu plan se activara automaticamente.</p>
          </div>
          <strong>Bs {formatBs(pendingPayment.amountBs)}</strong>
        </section>
      )}

      {paymentDraft && createPortal(
        <PaymentMobileModal
          currentUser={currentUser}
          draft={paymentDraft}
          onClose={() => setPaymentDraft(null)}
        />,
        document.body,
      )}
    </section>
  );
}

function PaymentMobileModal({ currentUser, draft, onClose }) {
  const banks = useQuery(api.payments.banks, {}) ?? [];
  const getBcvRate = useAction(api.payments.getBcvRate);
  const createPayment = useMutation(api.payments.create);
  const [step, setStep] = useState("intro");
  const [rateInfo, setRateInfo] = useState({ status: "loading", rate: 0, source: "" });
  const [form, setForm] = useState({
    amountBs: "",
    payerPhone: currentUser?.phone ?? "",
    bankCode: "0105",
    referenceLast4: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const expectedBs = rateInfo.rate ? roundMoney(draft.amountUsd * rateInfo.rate) : 0;

  useEffect(() => {
    let cancelled = false;
    setRateInfo({ status: "loading", rate: 0, source: "" });
    getBcvRate({})
      .then((result) => {
        if (cancelled) return;
        setRateInfo({
          status: result?.rate ? "ready" : "error",
          rate: result?.rate ?? 0,
          source: result?.source ?? "",
          updatedAt: result?.updatedAt,
          error: result?.error,
        });
        if (result?.rate) {
          setForm((current) => ({ ...current, amountBs: String(roundMoney(draft.amountUsd * result.rate).toFixed(2)) }));
        }
      })
      .catch((rateError) => {
        if (!cancelled) setRateInfo({ status: "error", rate: 0, source: "", error: rateError?.message });
      });
    return () => {
      cancelled = true;
    };
  }, [draft.amountUsd, getBcvRate]);

  async function submitPayment(event) {
    event.preventDefault();
    setError("");
    const validation = validatePaymentForm(form);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    try {
      await createPayment({
        userEmail: currentUser.email,
        userName: [currentUser.firstName, currentUser.lastName].filter(Boolean).join(" "),
        plan: draft.plan.id,
        billingPeriod: draft.billingPeriod,
        amountBs: parseMoney(form.amountBs),
        bcvRate: rateInfo.rate || undefined,
        payerPhone: form.payerPhone,
        bankCode: form.bankCode,
        referenceLast4: form.referenceLast4,
      });
      setSuccess(true);
      window.setTimeout(() => {
        onClose();
        window.location.hash = "profile";
      }, 1600);
    } catch (paymentError) {
      setError(paymentError?.message ?? "No se pudo registrar el pago.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="course-detail-overlay is-visible" role="dialog" aria-modal="true">
      <section className="course-detail-modal payment-mobile-modal">
        <header>
          <div>
            <p className="eyebrow">Pago movil</p>
            <h2>{draft.plan.name} · {draft.billingPeriod === "quarterly" ? "Trimestral" : "Mensual"}</h2>
            <span>{formatUsd(draft.amountUsd)} {expectedBs ? `· Bs ${formatBs(expectedBs)}` : ""}</span>
          </div>
          <button className="quiet-button" type="button" onClick={onClose} disabled={busy}>Cerrar</button>
        </header>

        {success ? (
          <div className="payment-success-panel">
            <strong>Pago reportado con exito</strong>
            <p>Tu solicitud quedo pendiente de verificacion. Te llevaremos al perfil.</p>
          </div>
        ) : (
          <div className="payment-mobile-body">
            {step === "intro" ? (
              <>
                <div className="payment-rate-card">
                  <span>Monto a pagar</span>
                  <strong>{formatUsd(draft.amountUsd)}</strong>
                  {rateInfo.status === "loading" && <p>Consultando tasa BCV...</p>}
                  {rateInfo.status === "ready" && (
                    <p>BCV: Bs {formatBs(rateInfo.rate)} · Total: <b>Bs {formatBs(expectedBs)}</b></p>
                  )}
                  {rateInfo.status === "error" && (
                    <p>No se pudo consultar la tasa automaticamente. Puedes confirmar el monto en bolivares manualmente.</p>
                  )}
                </div>
                <div className="payment-transfer-card">
                  <p className="payment-section-title">Datos para pago movil</p>
                  <dl>
                    <div><dt>C.I.</dt><dd>{PAYMENT_TARGET.nationalId}</dd></div>
                    <div><dt>Telefono</dt><dd>{PAYMENT_TARGET.displayPhone}</dd></div>
                    <div><dt>Banco</dt><dd>{PAYMENT_TARGET.bank}</dd></div>
                  </dl>
                </div>
                <div className="payment-modal-actions">
                  <button className="secondary-action" type="button" onClick={onClose}>Cancelar</button>
                  <button className="primary-action" type="button" onClick={() => setStep("confirm")}>Confirmar pago</button>
                </div>
              </>
            ) : (
              <form className="payment-confirm-form" onSubmit={submitPayment}>
                <p className="payment-section-title">Confirma los datos de tu transferencia</p>
                <label>
                  Monto exacto en Bs
                  <input
                    value={form.amountBs}
                    inputMode="decimal"
                    onChange={(event) => updatePaymentField(setForm, "amountBs", event.target.value)}
                    placeholder="0.00"
                    required
                  />
                </label>
                <label>
                  Telefono emisor
                  <input
                    value={form.payerPhone}
                    inputMode="numeric"
                    maxLength={11}
                    onChange={(event) => updatePaymentField(setForm, "payerPhone", event.target.value.replace(/\D/g, "").slice(0, 11))}
                    placeholder="04121234567"
                    required
                  />
                </label>
                <label>
                  Banco emisor
                  <BankSelect
                    banks={banks}
                    value={form.bankCode}
                    onChange={(nextBankCode) => updatePaymentField(setForm, "bankCode", nextBankCode)}
                  />
                </label>
                <label>
                  Ultimos 4 digitos de la referencia
                  <input
                    value={form.referenceLast4}
                    inputMode="numeric"
                    maxLength={4}
                    onChange={(event) => updatePaymentField(setForm, "referenceLast4", event.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="1234"
                    required
                  />
                </label>
                {error && <p className="auth-error">{error}</p>}
                <div className="payment-modal-actions">
                  <button className="secondary-action" type="button" onClick={() => setStep("intro")} disabled={busy}>Volver</button>
                  <button className="primary-action" type="submit" disabled={busy}>{busy ? "Enviando..." : "Confirmar pago"}</button>
                </div>
              </form>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function BankSelect({ banks, value, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = banks.find((bank) => bank.code === value) ?? banks[0] ?? { code: value, label: "Selecciona un banco" };

  function selectBank(bankCode) {
    onChange?.(bankCode);
    setOpen(false);
  }

  return (
    <div className={open ? "custom-select payment-bank-select is-open" : "custom-select payment-bank-select"}>
      <button
        className="custom-select-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Seleccionar banco emisor"
        onClick={() => setOpen((current) => !current)}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        <span className="custom-select-label">{selected?.label}</span>
        <span className="custom-select-chevron" aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="custom-select-menu" role="listbox" tabIndex={-1} aria-label="Bancos venezolanos">
          {banks.map((bank) => (
            <button
              className={bank.code === selected?.code ? "custom-select-option is-selected" : "custom-select-option"}
              type="button"
              role="option"
              aria-selected={bank.code === selected?.code}
              key={bank.code}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectBank(bank.code)}
            >
              <span className="custom-select-label">{bank.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function updatePaymentField(setForm, field, value) {
  setForm((current) => ({ ...current, [field]: value }));
}

function validatePaymentForm(form) {
  if (!/^\d+([.,]\d{1,2})?$/.test(form.amountBs.trim())) return "El monto debe ser numerico y puede tener hasta 2 decimales.";
  if (!/^0(2\d{2}|4(12|14|16|24|26))\d{7}$/.test(form.payerPhone.trim())) return "El telefono debe ser venezolano y tener 11 digitos.";
  if (!form.bankCode) return "Selecciona el banco emisor.";
  if (!/^\d{4}$/.test(form.referenceLast4.trim())) return "La referencia debe tener exactamente 4 digitos.";
  return "";
}

function parseMoney(value) {
  return roundMoney(Number(String(value).replace(",", ".")));
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function formatUsd(value) {
  return value ? `$${value}` : "$0";
}

function formatBs(value) {
  return Number(value ?? 0).toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function planLabel(plan) {
  if (plan === "pro") return "Pro";
  if (plan === "excellence") return "Excellence";
  return "Gratis";
}
