import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { requireAuthenticatedEmail } from "../convex/security.js";
import { effectivePlan, subscriptionEnd } from "../convex/paymentPricing.js";
import { profileFieldsToPersist } from "../convex/profileSync.js";

function contextFor(identity) {
  return { auth: { getUserIdentity: async () => identity } };
}

test("a verified account cannot claim another account email", async () => {
  const ctx = contextFor({ email: "owner@example.com", subject: "owner-id" });
  await assert.rejects(
    requireAuthenticatedEmail(ctx, "victim@example.com"),
    /otra cuenta/,
  );
  assert.equal((await requireAuthenticatedEmail(ctx, "OWNER@example.com")).email, "owner@example.com");
});

test("unauthenticated requests cannot read or mutate account-scoped data", async () => {
  await assert.rejects(requireAuthenticatedEmail(contextFor(null), "victim@example.com"), /iniciar sesión/);
});

test("first auth binding persists profile fields and careers submitted at signup", () => {
  const submitted = { firstName: "Ana", lastName: "Pérez", nationalId: "12345678", phone: "04121234567", careers: ["sistemas"] };
  assert.deepEqual(profileFieldsToPersist({ email: "ana@example.com" }, submitted, true), submitted);
});

test("profile sync on an already linked account fills blanks without overwriting saved fields", () => {
  const patch = profileFieldsToPersist(
    { firstName: "Ana", lastName: "", careers: ["civil"] },
    { firstName: "Otro nombre", lastName: "Pérez", careers: ["sistemas"] },
    false,
  );
  assert.deepEqual(patch, { lastName: "Pérez" });
});

test("Supabase sign-up does not replace the registration flow with a bare email-only session", async () => {
  const authPanel = await readFile(new URL("../src/components/AuthPanel.jsx", import.meta.url), "utf8");
  const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(authPanel, /onSignupStarted\?\.\(\)/);
  assert.match(authPanel, /await ensureSignupProfile\(recoverySetup\)/);
  assert.match(appSource, /if \(!active \|\| signupInProgressRef\.current\) return/);
  assert.match(appSource, /signupInProgressRef\.current = false/);
});

test("an expired paid plan automatically resolves to free", () => {
  const start = Date.UTC(2026, 0, 1);
  const payment = {
    status: "approved",
    plan: "pro",
    billingPeriod: "monthly",
    resolvedAt: start,
    subscriptionEndAt: subscriptionEnd(start, "monthly"),
  };
  assert.equal(effectivePlan({ storedPlan: "pro", userType: "user", payment }, payment.subscriptionEndAt - 1), "pro");
  assert.equal(effectivePlan({ storedPlan: "pro", userType: "user", payment }, payment.subscriptionEndAt), "free");
});

test("an explicit manual expiration overrides a still-valid payment date", () => {
  const now = Date.UTC(2026, 0, 1);
  const payment = {
    status: "approved",
    plan: "pro",
    billingPeriod: "quarterly",
    resolvedAt: now - 10,
    subscriptionEndAt: now + 30 * 24 * 60 * 60 * 1000,
  };
  assert.equal(effectivePlan({
    storedPlan: "pro",
    userType: "user",
    planExpiresAt: now - 1,
    payment,
  }, now), "free");
});

test("password recovery no longer sends email and directs users to the admin flow", async () => {
  const source = await readFile(new URL("../src/components/AuthPanel.jsx", import.meta.url), "utf8");
  const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const recoveryAction = await readFile(new URL("../convex/recoveryCredentials.js", import.meta.url), "utf8");
  const recoveryInternal = await readFile(new URL("../convex/recoveryCredentialsInternal.js", import.meta.url), "utf8");
  const usersBackend = await readFile(new URL("../convex/users.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /resetPasswordForEmail/);
  assert.doesNotMatch(source, /verifyOtp\(\{ email, token, type: "recovery" \}\)/);
  assert.doesNotMatch(source, /name="recoveryCode"|Enviar código/);
  assert.match(source, /PASSWORD_RECOVERY|recoveryPassword/);
  assert.match(source, /Clave aleatoria/);
  assert.match(source, /Pregunta de seguridad/);
  assert.match(source, /initializeRecovery\(/);
  assert.match(source, /finishSignupRecovery\(recoverySetup\)/);
  assert.match(recoveryAction, /resetPassword = action/);
  assert.match(recoveryAction, /auth\.admin\.updateUserById/);
  assert.match(recoveryAction, /PBKDF2_ITERATIONS/);
  assert.match(recoveryAction, /recordAttempt/);
  assert.match(recoveryInternal, /recoveryCodeConsumedAt/);
  assert.match(recoveryInternal, /MAX_ATTEMPTS_PER_WINDOW = 5/);
  assert.match(usersBackend, /withoutPrivateAuthFields/);
  assert.match(source, /contacta al administrador/);
  assert.match(source, /updateUser\(\{ password: nextPassword \}\)/);
  assert.match(appSource, /callbackTokenHash/);
  assert.doesNotMatch(source, /function\s+resetLocalPassword/);
  assert.doesNotMatch(source, /function\s+(createLocalAccount|writeUsers|signInLocalAccount)/);
});

test("administrator password reset keeps privilege and provider secrets on the server", async () => {
  const actionSource = await readFile(new URL("../convex/adminPasswordReset.js", import.meta.url), "utf8");
  const internalSource = await readFile(new URL("../convex/adminPasswordResetInternal.js", import.meta.url), "utf8");
  const usersSource = await readFile(new URL("../src/views/UsersView.jsx", import.meta.url), "utf8");
  assert.match(actionSource, /requireAuthenticatedEmail\(ctx\)/);
  assert.match(actionSource, /process\.env\.ADMIN_PASSWORD_RESET_KEY/);
  assert.match(actionSource, /process\.env\.SUPABASE_SECRET_KEY/);
  assert.match(actionSource, /auth\.admin\.updateUserById/);
  assert.match(actionSource, /constantTimeSecretMatches/);
  assert.match(internalSource, /isKnownAdmin\(ctx, adminEmail\)/);
  assert.match(internalSource, /supabaseAuthUserId === args\.adminSubject/);
  assert.match(internalSource, /MAX_ATTEMPTS_PER_WINDOW = 5/);
  assert.doesNotMatch(actionSource, /F3EB7893RFN890/);
  assert.doesNotMatch(usersSource, /SUPABASE_SECRET_KEY|ADMIN_PASSWORD_RESET_KEY\s*=/);
});
