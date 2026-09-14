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
    bimonthly: 0,
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
    bimonthly: 5,
    quarterly: 7,
    badge: "Trimestral: ahorra 22,22 %",
    description: "Para estudiar con materiales Pro sin fricción.",
    features: [
      "Materiales gratis y Pro sin límites",
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
    bimonthly: 6.5,
    quarterly: 9,
    badge: "Trimestral: ahorra 25 %",
    description: "Todo Synapse desbloqueado para estudiar a fondo.",
    features: [
      "Todo lo incluido en Pro",
      "Herramientas ilimitadas de tu carrera",
      "Sin límites mensuales de uso académico",
      "Ideal para parciales, guías y práctica intensiva",
    ],
  },
];

export function PlansView({ currentUser, currentPlan = "free", isAdmin = false, pendingPayment = null }) {
  const [paymentDraft, setPaymentDraft] = useState(null);
  const [discountNoticeDraft, setDiscountNoticeDraft] = useState(null);
  const normalizedPlan = isAdmin ? "admin" : currentPlan;
  const profile = useQuery(api.users.getProfile, isAdmin ? "skip" : { email: currentUser.email });
  const availableDiscountPercent = Math.max(0, Number(profile?.nextPaymentDiscountPercent) || 0);
  const billingOptions = useQuery(api.payments.billingOptions, isAdmin ? "skip" : { userEmail: currentUser.email });

  function openPayment(optionDraft) {
    if (availableDiscountPercent > 0) {
      setDiscountNoticeDraft(optionDraft);
      return;
    }
    setPaymentDraft(optionDraft);
  }

  return (
    <section className="workspace plans-workspace">
      <div className="workspace-header plans-header">
        <div className="materials-heading-copy">
          <p className="eyebrow">Planes Synapse</p>
          <h1>Escoge cómo quieres estudiar</h1>
          <p>Completa el pago móvil y un administrador verificará la transferencia para activar tu plan.</p>
        </div>
        <div className="plans-current-card">
          <span>Plan actual</span>
          <strong>{isAdmin ? "Admin" : planLabel(currentPlan)}</strong>
          {pendingPayment && <small>Pago pendiente de verificación</small>}
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
                <span>Bimensual</span>
                <strong>{formatUsd(plan.bimonthly)}</strong>
                <small>/ 2 meses</small>
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
            <div className="plan-payment-actions">
              <div className="plan-action-group">
                {plan.id === "free" ? (
                  <button className="primary-action plan-action" type="button" disabled>
                    {normalizedPlan === plan.id ? "Plan activo" : "Incluido"}
                  </button>
                ) : (
                  ["monthly", "bimonthly", "quarterly"].map((period) => {
                    const option = billingOptions?.[plan.id]?.[period];
                    return <button key={period} className={period === "quarterly" ? "primary-action plan-pay-action" : period === "bimonthly" ? "secondary-action bimonthly-action plan-pay-action" : "secondary-action plan-pay-action"}
                      type="button" disabled={isAdmin || Boolean(pendingPayment) || !option}
                      onClick={() => openPayment({ plan, billingPeriod: period, ...option })}>
                      {option?.basePaymentId
                        ? plan.id !== normalizedPlan
                          ? `Subir a ${plan.name} ${periodLabel(period)} · ${formatUsd(option.amountUsd)}`
                          : `Ampliar a ${periodLabel(period)} · ${formatUsd(option.amountUsd)}`
                        : `Pagar ${periodLabel(period)}`}
                    </button>;
                  })
                )}
              </div>
              {plan.id !== "free" && availableDiscountPercent > 0 && (
                <p className="plan-discount-notice">
                  Tienes {availableDiscountPercent}% de descuento disponible para tu próximo pago.
                </p>
              )}
            </div>
          </article>
        ))}
      </section>

      {pendingPayment && (
        <section className="payment-pending-banner">
          <div>
            <p className="eyebrow">Pago pendiente</p>
            <h2>{planLabel(pendingPayment.plan)} {periodLabel(pendingPayment.billingPeriod)}</h2>
            <p>Tu reporte de pago móvil fue enviado. Cuando el admin lo apruebe, tu plan se activará automáticamente.</p>
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
      {discountNoticeDraft && createPortal(
        <PaymentDiscountNoticeModal
          discountPercent={availableDiscountPercent}
          draft={discountNoticeDraft}
          onClose={() => setDiscountNoticeDraft(null)}
          onContinue={() => {
            setPaymentDraft(discountNoticeDraft);
            setDiscountNoticeDraft(null);
          }}
        />,
        document.body,
      )}
    </section>
  );
}

function PaymentDiscountNoticeModal({ discountPercent, draft, onClose, onContinue }) {
  return (
    <div className="course-detail-overlay payment-mobile-overlay is-visible" role="dialog" aria-modal="true" aria-labelledby="payment-discount-title">
      <section className="course-detail-modal payment-mobile-modal payment-discount-modal">
        <header>
          <div>
            <p className="eyebrow">Descuento disponible</p>
            <h2 id="payment-discount-title">Tienes {discountPercent}% para usar</h2>
            <span>{draft.plan.name} · {periodLabel(draft.billingPeriod)}</span>
          </div>
          <button className="quiet-button" type="button" onClick={onClose}>Cerrar</button>
        </header>
        <div className="payment-discount-panel">
          <p>Tu descuento acumulado se aplicará automáticamente al monto de este pago.</p>
          <small>En una compra se usa hasta 100%; cualquier porcentaje restante quedará disponible para tu próximo pago.</small>
          <div className="payment-modal-actions">
            <button className="secondary-action" type="button" onClick={onClose}>Cancelar</button>
            <button className="primary-action" type="button" onClick={onContinue}>Ver monto y datos de pago</button>
          </div>
        </div>
      </section>
    </div>
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
    referralCode: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const quote = useQuery(api.payments.paymentQuote, {
    userEmail: currentUser.email,
    plan: draft.plan.id,
    billingPeriod: draft.billingPeriod,
    referralCode: form.referralCode.length === 8 ? form.referralCode : "",
  });
  const quotedDraft = quote?.option ?? draft;
  const referralError = form.referralCode && form.referralCode.length < 8
    ? "El código de referido debe tener 8 caracteres."
    : quote?.referralError ?? "";
  const expectedBs = rateInfo.rate ? roundMoney(quotedDraft.amountUsd * rateInfo.rate) : 0;
  const isFullyDiscounted = quotedDraft.amountUsd === 0;

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
          setForm((current) => ({ ...current, amountBs: String(roundMoney(quotedDraft.amountUsd * result.rate).toFixed(2)) }));
        }
      })
      .catch((rateError) => {
        if (!cancelled) setRateInfo({ status: "error", rate: 0, source: "", error: rateError?.message });
      });
    return () => {
      cancelled = true;
    };
  }, [quotedDraft.amountUsd, getBcvRate]);

  async function submitPayment(event) {
    event.preventDefault();
    setError("");
    const validation = validatePaymentForm(form, isFullyDiscounted);
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
        amountBs: isFullyDiscounted ? 0 : parseMoney(form.amountBs),
        bcvRate: rateInfo.rate || undefined,
        payerPhone: isFullyDiscounted ? "" : form.payerPhone,
        bankCode: isFullyDiscounted ? "" : form.bankCode,
        referenceLast4: isFullyDiscounted ? "" : form.referenceLast4,
        basePaymentId: quotedDraft.basePaymentId,
        referralCode: form.referralCode,
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
    <div className="course-detail-overlay payment-mobile-overlay is-visible" role="dialog" aria-modal="true">
      <section className="course-detail-modal payment-mobile-modal">
        <header>
          <div>
            <p className="eyebrow">Pago móvil</p>
            <h2>{draft.plan.name} · {periodLabel(draft.billingPeriod)}</h2>
            <span>{formatUsd(quotedDraft.amountUsd)} {expectedBs ? `· Bs ${formatBs(expectedBs)}` : ""}</span>
          </div>
          <button className="quiet-button" type="button" onClick={onClose} disabled={busy}>Cerrar</button>
        </header>

        {success ? (
          <div className="payment-success-panel">
            <strong>Pago reportado con exito</strong>
            <p>Tu solicitud quedó pendiente de verificación. Te llevaremos al perfil.</p>
          </div>
        ) : (
          <div className="payment-mobile-body">
            {step === "intro" ? (
              <>
                <div className="payment-rate-card">
                  <span>Monto a pagar</span>
                  <strong>{formatUsd(quotedDraft.amountUsd)}</strong>
                  {draft.basePaymentId && <p>
                    {draft.plan.name} {periodLabel(draft.billingPeriod)} {formatUsd(draft.plan[draft.billingPeriod])} − monto abonado {formatUsd(quotedDraft.creditedUsd)}.
                    {" "}Vencimiento: {new Date(draft.subscriptionEndAt).toLocaleDateString("es-VE")}.
                  </p>}
              {quotedDraft.discountPercent > 0 ? (
                <p>
                  {quotedDraft.discountSource === "referral"
                    ? `Incluye ${quotedDraft.discountPercent}% de descuento por el código de referido.`
                    : `Incluye ${quotedDraft.discountPercent}% de descuento disponible para este pago.`}
                </p>
              ) : (
                <p>Sin descuentos aplicados.</p>
              )}
                  {rateInfo.status === "loading" && <p>Consultando tasa BCV...</p>}
                  {rateInfo.status === "ready" && (
                    <p>BCV: Bs {formatBs(rateInfo.rate)} · Total: <b>Bs {formatBs(expectedBs)}</b></p>
                  )}
                  {rateInfo.status === "error" && (
                    <p>No se pudo consultar la tasa automáticamente. Puedes confirmar el monto en bolívares manualmente.</p>
                  )}
                </div>
                {isFullyDiscounted ? (
                  <div className="payment-transfer-card">
                    <p className="payment-section-title">Descuento total aplicado</p>
                    <p>No necesitas realizar una transferencia. Envía la solicitud para que el administrador active tu plan.</p>
                  </div>
                ) : (
                  <div className="payment-transfer-card">
                      <p className="payment-section-title">Datos para pago móvil</p>
                    <dl>
                      <div><dt>C.I.</dt><dd>{PAYMENT_TARGET.nationalId}</dd></div>
                      <div><dt>Teléfono</dt><dd>{PAYMENT_TARGET.displayPhone}</dd></div>
                      <div><dt>Banco</dt><dd>{PAYMENT_TARGET.bank}</dd></div>
                    </dl>
                  </div>
                )}
                <label className="payment-referral-field">
                  Código de Referido <small>(opcional)</small>
                  <input
                    value={form.referralCode}
                    inputMode="text"
                    maxLength={8}
                    onChange={(event) => updatePaymentField(setForm, "referralCode", event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
                    placeholder="ABCD1234"
                  />
                  {referralError && <span className="payment-referral-error">{referralError}</span>}
                </label>
                <div className="payment-modal-actions">
                  <button className="secondary-action" type="button" onClick={onClose}>Cancelar</button>
                  <button className="primary-action" type="button" disabled={!quote || Boolean(referralError)} onClick={() => setStep("confirm")}>Confirmar pago</button>
                </div>
              </>
            ) : (
              <form className="payment-confirm-form" onSubmit={submitPayment}>
                <p className="payment-section-title">{isFullyDiscounted ? "Confirma la activación de tu plan" : "Confirma los datos de tu transferencia"}</p>
                {isFullyDiscounted ? <p>La solicitud se enviará sin pago móvil porque tu descuento acumulado cubre el 100%.</p> : <>
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
                    Teléfono emisor
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
                    Últimos 4 dígitos de la referencia
                    <input
                      value={form.referenceLast4}
                      inputMode="numeric"
                      maxLength={4}
                      onChange={(event) => updatePaymentField(setForm, "referenceLast4", event.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="1234"
                      required
                    />
                  </label>
                </>}
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
  const [search, setSearch] = useState("");
  const selected = banks.find((bank) => bank.code === value) ?? banks[0] ?? { code: value, label: "Selecciona un banco" };
  const filteredBanks = useMemo(() => {
    const query = normalizeBankSearch(search);
    if (!query) return banks;
    return banks.filter((bank) => normalizeBankSearch(`${bank.label} ${bank.code}`).includes(query));
  }, [banks, search]);

  function selectBank(bankCode) {
    onChange?.(bankCode);
    setSearch("");
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
        onClick={() => {
          setSearch("");
          setOpen((current) => !current);
        }}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        <span className="custom-select-label">{selected?.label}</span>
        <span className="custom-select-chevron" aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="custom-select-menu" role="listbox" tabIndex={-1} aria-label="Bancos venezolanos">
          <div className="custom-select-search" role="presentation">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar banco..."
              aria-label="Buscar banco"
              autoFocus
              onClick={(event) => event.stopPropagation()}
            />
          </div>
          <div className="custom-select-options">
          {filteredBanks.map((bank) => (
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
          {filteredBanks.length === 0 && <div className="custom-select-empty">No hay bancos con ese nombre o código.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function normalizeBankSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function updatePaymentField(setForm, field, value) {
  setForm((current) => ({ ...current, [field]: value }));
}

function validatePaymentForm(form, isFullyDiscounted = false) {
  if (isFullyDiscounted) return "";
  if (!/^\d+([.,]\d{1,2})?$/.test(form.amountBs.trim())) return "El monto debe ser numerico y puede tener hasta 2 decimales.";
  if (!/^0(2\d{2}|4(12|14|16|24|26))\d{7}$/.test(form.payerPhone.trim())) return "El teléfono debe ser venezolano y tener 11 dígitos.";
  if (!form.bankCode) return "Selecciona el banco emisor.";
  if (!/^\d{4}$/.test(form.referenceLast4.trim())) return "La referencia debe tener exactamente 4 dígitos.";
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

function periodLabel(period) {
  return period === "bimonthly" ? "bimensual" : period === "quarterly" ? "trimestral" : "mensual";
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
