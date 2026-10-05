"use node";

import { createClient } from "@supabase/supabase-js";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAuthenticatedEmail } from "./security";

const BUCKET = "materials";

export const createUpload = action({
  args: {
    fileName: v.string(),
    mimeType: v.string(),
    size: v.number(),
    kind: v.union(v.literal("pdf"), v.literal("images")),
  },
  returns: v.object({ path: v.string(), token: v.string() }),
  handler: async (ctx, args) => {
    const { email, subject } = await requireAuthenticatedEmail(ctx);
    await ctx.runQuery(internal.storageAuth.authorizeUpload, { actorEmail: email, mimeType: args.mimeType, size: args.size });
    const safeName = args.fileName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120) || "material";
    const path = `${subject}/${args.kind}/${crypto.randomUUID()}-${safeName}`;
    const { data, error } = await storageClient().storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data?.token) throw new Error("No se pudo autorizar la subida del archivo.");
    return { path, token: data.token };
  },
});

export const createDownload = action({
  args: { storagePath: v.string(), expiresIn: v.optional(v.number()) },
  returns: v.string(),
  handler: async (ctx, args) => {
    const { email } = await requireAuthenticatedEmail(ctx);
    await ctx.runMutation(internal.storageAuth.authorizeDownload, { actorEmail: email, storagePath: args.storagePath });
    const expiresIn = Math.min(600, Math.max(30, Math.floor(args.expiresIn ?? 60)));
    const { data, error } = await storageClient().storage.from(BUCKET).createSignedUrl(args.storagePath, expiresIn);
    if (error || !data?.signedUrl) throw new Error("No se pudo autorizar la entrega del archivo.");
    return data.signedUrl;
  },
});

export const remove = action({
  args: { storagePath: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { email } = await requireAuthenticatedEmail(ctx);
    await ctx.runQuery(internal.storageAuth.authorizeDelete, { actorEmail: email });
    const { error } = await storageClient().storage.from(BUCKET).remove([args.storagePath]);
    if (error) throw new Error("No se pudo borrar el archivo del almacenamiento.");
    return null;
  },
});

function storageClient() {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("El almacenamiento seguro no está configurado en el servidor.");
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
