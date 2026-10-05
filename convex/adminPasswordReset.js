"use node";

import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAuthenticatedEmail } from "./security";

export const resetPassword = action({
  args: {
    adminKey: v.string(),
    targetEmail: v.string(),
    newPassword: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { email: adminEmail, subject: adminSubject } = await requireAuthenticatedEmail(ctx);
    if (args.newPassword.length < 8 || args.newPassword.length > 128) {
      throw new Error("La nueva contraseña debe tener entre 8 y 128 caracteres.");
    }
    const { supabaseAuthUserId } = await ctx.runMutation(
      internal.adminPasswordResetInternal.authorizeAndRecordAttempt,
      { adminEmail, adminSubject, targetEmail: args.targetEmail },
    );

    const configuredAdminKey = process.env.ADMIN_PASSWORD_RESET_KEY;
    if (!configuredAdminKey) throw new Error("Falta configurar la clave administrativa de restablecimiento en Convex.");
    if (!constantTimeSecretMatches(args.adminKey, configuredAdminKey)) {
      throw new Error("La clave administrativa no es válida.");
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseSecret = process.env.SUPABASE_SECRET_KEY;
    if (!supabaseUrl || !supabaseSecret) {
      throw new Error("La conexión administrativa con Supabase no está configurada en el servidor.");
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await supabase.auth.admin.updateUserById(supabaseAuthUserId, {
      password: args.newPassword,
    });
    if (error) throw new Error("Supabase no pudo actualizar la contraseña. Verifica la clave y vuelve a intentarlo.");

    await ctx.runMutation(internal.adminPasswordResetInternal.recordSuccess, { adminEmail, targetEmail: args.targetEmail });
    return null;
  },
});

function constantTimeSecretMatches(candidate, secret) {
  const candidateBytes = Buffer.from(String(candidate), "utf8");
  const secretBytes = Buffer.from(String(secret), "utf8");
  return candidateBytes.length === secretBytes.length && timingSafeEqual(candidateBytes, secretBytes);
}
