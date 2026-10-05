"use node";

import { createClient } from "@supabase/supabase-js";
import { pbkdf2, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAuthenticatedEmail } from "./security";

const pbkdf2Async = promisify(pbkdf2);
const PBKDF2_ITERATIONS = 180_000;
const QUESTION = v.union(
  v.literal("first_pet"),
  v.literal("first_car"),
  v.literal("birth_city"),
  v.literal("childhood_nickname"),
  v.literal("first_school"),
  v.literal("favorite_food"),
);

export const initializeForCurrentUser = action({
  args: { question: QUESTION, answer: v.string() },
  returns: v.object({ recoveryCode: v.string() }),
  handler: async (ctx, args) => {
    const { email, subject } = await requireAuthenticatedEmail(ctx);
    if (args.answer.length > 40) throw new Error("La respuesta debe tener máximo 20 caracteres.");
    const answer = normalizeAnswer(args.answer);
    if (!answer || answer.length > 20) throw new Error("La respuesta debe tener entre 1 y 20 caracteres.");
    const recoveryCode = makeRecoveryCode();
    const codeSalt = randomBytes(16).toString("hex");
    const answerSalt = randomBytes(16).toString("hex");
    const [recoveryCodeHash, recoveryAnswerHash] = await Promise.all([
      hashSecret(normalizeCode(recoveryCode), codeSalt),
      hashSecret(answer, answerSalt),
    ]);
    await ctx.runMutation(internal.recoveryCredentialsInternal.saveForCurrentUser, {
      email,
      subject,
      recoveryCodeHash,
      recoveryCodeSalt: codeSalt,
      recoveryQuestion: args.question,
      recoveryAnswerHash,
      recoveryAnswerSalt: answerSalt,
    });
    return { recoveryCode: formatCode(recoveryCode) };
  },
});

export const resetPassword = action({
  args: {
    email: v.string(),
    method: v.union(v.literal("code"), v.literal("question")),
    recoveryCode: v.optional(v.string()),
    question: v.optional(QUESTION),
    answer: v.optional(v.string()),
    newPassword: v.string(),
  },
  returns: v.object({ recoveryCode: v.string() }),
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    if (args.email.length > 254 || !email.includes("@") || args.newPassword.length < 8 || args.newPassword.length > 128) {
      throw new Error("No se pudo restablecer la contraseña. Verifica los datos e inténtalo de nuevo.");
    }
    if (args.method === "code" && (args.recoveryCode ?? "").length > 40) {
      throw new Error("No se pudo restablecer la contraseña. Verifica el correo y la clave o respuesta e inténtalo de nuevo.");
    }
    if (args.method === "question" && (args.answer ?? "").length > 20) {
      throw new Error("No se pudo restablecer la contraseña. Verifica el correo y la clave o respuesta e inténtalo de nuevo.");
    }
    await ctx.runMutation(internal.recoveryCredentialsInternal.recordAttempt, { email });
    const record = await ctx.runQuery(internal.recoveryCredentialsInternal.loadRecoveryRecord, { email });
    if (!record || record.recoveryResetReservedUntil && record.recoveryResetReservedUntil > Date.now()) {
      throw new Error("No se pudo restablecer la contraseña. Verifica el correo y la clave o respuesta e inténtalo de nuevo.");
    }

    let salt;
    let storedHash;
    let candidate;
    if (args.method === "code") {
      const code = normalizeCode(args.recoveryCode ?? "");
      if (!/^[A-F0-9]{32}$/.test(code) || !record.recoveryCodeHash || !record.recoveryCodeSalt || record.recoveryCodeConsumedAt) {
        throw new Error("No se pudo restablecer la contraseña. Verifica el correo y la clave o respuesta e inténtalo de nuevo.");
      }
      salt = record.recoveryCodeSalt;
      storedHash = record.recoveryCodeHash;
      candidate = await hashSecret(code, salt);
    } else {
      const answer = normalizeAnswer(args.answer ?? "");
      if (!args.question || args.question !== record.recoveryQuestion || !answer || answer.length > 20
        || !record.recoveryAnswerHash || !record.recoveryAnswerSalt) {
        throw new Error("No se pudo restablecer la contraseña. Verifica el correo y la clave o respuesta e inténtalo de nuevo.");
      }
      salt = record.recoveryAnswerSalt;
      storedHash = record.recoveryAnswerHash;
      candidate = await hashSecret(answer, salt);
    }
    if (!constantTimeHashMatches(candidate, storedHash)) {
      throw new Error("No se pudo restablecer la contraseña. Verifica el correo y la clave o respuesta e inténtalo de nuevo.");
    }

    const reservationId = randomUUID();
    try {
      await ctx.runMutation(internal.recoveryCredentialsInternal.reserveReset, {
        userId: record.userId,
        method: args.method,
        question: args.method === "question" ? args.question : undefined,
        expectedVerifierHash: storedHash,
        candidateVerifierHash: candidate,
        reservationId,
      });
    } catch {
      throw new Error("No se pudo restablecer la contraseña. Verifica el correo y la clave o respuesta e inténtalo de nuevo.");
    }

    try {
      const supabase = adminSupabaseClient();
      const { error } = await supabase.auth.admin.updateUserById(record.supabaseAuthUserId, {
        password: args.newPassword,
      });
      if (error) throw error;
    } catch {
      await ctx.runMutation(internal.recoveryCredentialsInternal.releaseReset, {
        userId: record.userId,
        reservationId,
      });
      throw new Error("No se pudo actualizar la contraseña. Inténtalo de nuevo o contacta al administrador.");
    }

    const recoveryCode = makeRecoveryCode();
    const recoveryCodeSalt = randomBytes(16).toString("hex");
    const recoveryCodeHash = await hashSecret(normalizeCode(recoveryCode), recoveryCodeSalt);
    await ctx.runMutation(internal.recoveryCredentialsInternal.finishReset, {
      userId: record.userId,
      reservationId,
      recoveryCodeHash,
      recoveryCodeSalt,
    });
    return { recoveryCode: formatCode(recoveryCode) };
  },
});

function adminSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("Supabase admin credentials are not configured.");
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function hashSecret(value, salt) {
  const digest = await pbkdf2Async(value, Buffer.from(salt, "hex"), PBKDF2_ITERATIONS, 32, "sha256");
  return digest.toString("hex");
}

function constantTimeHashMatches(left, right) {
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return leftBytes.length === 32 && rightBytes.length === 32 && timingSafeEqual(leftBytes, rightBytes);
}

function makeRecoveryCode() {
  return randomBytes(16).toString("hex").toUpperCase();
}

function formatCode(code) {
  return code.match(/.{1,4}/g).join("-");
}

function normalizeCode(value) {
  return String(value ?? "").replace(/[^a-f0-9]/gi, "").toUpperCase();
}

function normalizeAnswer(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}
