export function normalizeVerifiedEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function verifiedEmailFromIdentity(identity) {
  const email = normalizeVerifiedEmail(identity?.email);
  if (!email || !email.includes("@")) {
    throw new Error("La sesión autenticada no contiene un correo verificado.");
  }
  return email;
}

export async function requireAuthenticatedIdentity(ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Debes iniciar sesión para realizar esta operación.");
  return identity;
}

export async function requireAuthenticatedEmail(ctx, claimedEmail) {
  const identity = await requireAuthenticatedIdentity(ctx);
  const email = verifiedEmailFromIdentity(identity);
  if (claimedEmail !== undefined && normalizeVerifiedEmail(claimedEmail) !== email) {
    throw new Error("No puedes acceder a los datos de otra cuenta.");
  }
  return { email, identity, subject: String(identity.subject ?? "") };
}
