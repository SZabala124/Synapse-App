"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

export const reset = action({
  args: { email: v.string(), nationalId: v.string(), password: v.string() },
  returns: v.object({ profile: v.any() }),
  handler: async (ctx, args) => {
    if (args.password.length < 8) throw new Error("La contraseña debe tener mínimo 8 caracteres.");
    const verified = await ctx.runMutation(internal.users.verifyPasswordRecovery, {
      email: args.email,
      nationalId: args.nationalId,
    });
    const secret = process.env.SUPABASE_SECRET_KEY;
    const url = process.env.SUPABASE_URL;
    if (!secret || !url) throw new Error("La recuperación segura todavía no está configurada.");
    const userId = verified.supabaseAuthUserId ?? await findAuthUserId(url, secret, verified.profile.email);
    if (!userId) throw new Error("No pudimos encontrar la identidad de acceso de esta cuenta.");
    const response = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
      method: "PUT",
      headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ password: args.password }),
    });
    if (!response.ok) throw new Error("No se pudo actualizar la contraseña central. Intenta de nuevo.");
    await ctx.runMutation(internal.users.saveSupabaseAuthUserId, { email: verified.profile.email, supabaseAuthUserId: userId });
    return { profile: verified.profile };
  },
});

async function findAuthUserId(url, secret, email) {
  const response = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: { apikey: secret, Authorization: `Bearer ${secret}` },
  });
  if (!response.ok) return null;
  const data = await response.json();
  const user = (data.users ?? []).find((entry) => String(entry.email ?? "").toLowerCase() === email.toLowerCase());
  return user?.id ?? null;
}
