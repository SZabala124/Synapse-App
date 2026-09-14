import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { isAdmin } from "./users";

const RAPID_MESSAGE_WINDOW_MS = 3 * 60 * 1000;
const FIRST_COOLDOWN_MS = 10 * 60 * 1000;
const ESCALATION_WINDOW_MS = 15 * 60 * 1000;
const ESCALATED_COOLDOWN_MS = 60 * 60 * 1000;

export const getPostingCooldown = query({
  args: { userEmail: v.string() },
  handler: async (ctx, args) => {
    const userEmail = args.userEmail.trim().toLowerCase();
    if (await isAdmin(ctx, userEmail)) {
      return { cooldownUntil: 0, isExempt: true };
    }
    const limit = await ctx.db
      .query("commentRateLimits")
      .withIndex("by_user", (q) => q.eq("userEmail", userEmail))
      .first();
    return {
      cooldownUntil: limit?.cooldownUntil ?? 0,
      isExempt: false,
    };
  },
});

export const list = query({
  args: {
    userEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("comments").order("desc").take(240);
    const likes = args.userEmail
      ? await ctx.db
        .query("commentLikes")
        .withIndex("by_user_comment", (q) => q.eq("userEmail", args.userEmail.trim().toLowerCase()))
        .collect()
      : [];
    const reports = args.userEmail
      ? await ctx.db
        .query("commentReports")
        .withIndex("by_reporter_comment", (q) => q.eq("reporterEmail", args.userEmail.trim().toLowerCase()))
        .collect()
      : [];
    const likedCommentIds = new Set(likes.map((like) => like.commentId));
    const reportedCommentIds = new Set(reports.filter((reportRow) => reportRow.status === "pending").map((reportRow) => reportRow.commentId));

    const authorEmails = Array.from(new Set(rows.map((comment) => comment.userEmail).filter(Boolean)));
    const adminAuthors = new Set();
    for (const email of authorEmails) {
      if (await isAdmin(ctx, email)) adminAuthors.add(email);
    }

    const comments = rows.map((comment) => ({
      ...comment,
      authorIsAdmin: adminAuthors.has(comment.userEmail),
      likedByMe: likedCommentIds.has(comment._id),
      reportedByMe: reportedCommentIds.has(comment._id),
    }));
    const repliesByParent = new Map();
    const roots = [];

    for (const comment of comments) {
      if (comment.parentId) {
        const replies = repliesByParent.get(comment.parentId) ?? [];
        replies.push(comment);
        repliesByParent.set(comment.parentId, replies);
      } else {
        roots.push(comment);
      }
    }

    function withReplies(comment) {
      return {
        ...comment,
        replies: (repliesByParent.get(comment._id) ?? [])
          .sort((left, right) => left.createdAt - right.createdAt)
          .map(withReplies),
      };
    }

    return roots.map(withReplies);
  },
});

export const create = mutation({
  args: {
    body: v.string(),
    userEmail: v.string(),
    parentId: v.optional(v.id("comments")),
  },
  handler: async (ctx, args) => {
    const body = args.body.trim();
    const userEmail = args.userEmail.trim().toLowerCase();
    if (body.length < 3) throw new Error("El comentario necesita al menos 3 caracteres.");
    if (body.length > 1200) throw new Error("El comentario no puede superar 1200 caracteres.");

    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent) throw new Error("El comentario al que respondes ya no existe.");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", userEmail))
      .first();
    const authorName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || userEmail;
    const now = Date.now();
    await registerCommentActivity(ctx, userEmail, now);

    return await ctx.db.insert("comments", {
      body,
      userEmail,
      authorName,
      parentId: args.parentId,
      likeCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

async function registerCommentActivity(ctx, userEmail, now) {
  if (await isAdmin(ctx, userEmail)) return;

  const limit = await ctx.db
    .query("commentRateLimits")
    .withIndex("by_user", (q) => q.eq("userEmail", userEmail))
    .first();

  if ((limit?.cooldownUntil ?? 0) > now) {
    throw new Error(`Has enviado mensajes muy rápido. Espera ${formatCooldown(limit.cooldownUntil - now)} antes de volver a comentar.`);
  }

  const inEscalationWindow = Boolean(
    limit?.cooldownUntil
      && now >= limit.cooldownUntil
      && now <= limit.escalationWindowEndsAt,
  );
  const recentMessageAt = (limit?.recentMessageAt ?? [])
    .filter((timestamp) => now - timestamp < RAPID_MESSAGE_WINDOW_MS)
    .concat(now);
  let cooldownUntil = inEscalationWindow ? limit.cooldownUntil : 0;
  let escalationWindowEndsAt = inEscalationWindow ? limit.escalationWindowEndsAt : 0;
  let messagesAfterCooldown = inEscalationWindow
    ? (limit?.messagesAfterCooldown ?? 0) + 1
    : 0;

  if (inEscalationWindow && messagesAfterCooldown >= 2) {
    cooldownUntil = now + ESCALATED_COOLDOWN_MS;
    escalationWindowEndsAt = 0;
    messagesAfterCooldown = 0;
    recentMessageAt.splice(0, recentMessageAt.length, now);
  } else if (!inEscalationWindow && recentMessageAt.length >= 3) {
    cooldownUntil = now + FIRST_COOLDOWN_MS;
    escalationWindowEndsAt = cooldownUntil + ESCALATION_WINDOW_MS;
    messagesAfterCooldown = 0;
    recentMessageAt.splice(0, recentMessageAt.length, now);
  } else if (inEscalationWindow) {
    escalationWindowEndsAt = limit.escalationWindowEndsAt;
  }

  const nextLimit = {
    userEmail,
    recentMessageAt,
    cooldownUntil,
    escalationWindowEndsAt,
    messagesAfterCooldown,
    updatedAt: now,
  };
  if (limit) await ctx.db.patch(limit._id, nextLimit);
  else await ctx.db.insert("commentRateLimits", nextLimit);
}

function formatCooldown(remainingMs) {
  const totalSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes} min ${String(seconds).padStart(2, "0")} s` : `${seconds} s`;
}

export const toggleLike = mutation({
  args: {
    id: v.id("comments"),
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const userEmail = args.userEmail.trim().toLowerCase();
    const comment = await ctx.db.get(args.id);
    if (!comment) throw new Error("Comentario no disponible.");

    const existing = await ctx.db
      .query("commentLikes")
      .withIndex("by_user_comment", (q) => q.eq("userEmail", userEmail).eq("commentId", args.id))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(args.id, {
        likeCount: Math.max(0, (comment.likeCount ?? 0) - 1),
        updatedAt: Date.now(),
      });
      return false;
    }

    await ctx.db.insert("commentLikes", {
      commentId: args.id,
      userEmail,
      createdAt: Date.now(),
    });
    await ctx.db.patch(args.id, {
      likeCount: (comment.likeCount ?? 0) + 1,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const update = mutation({
  args: {
    id: v.id("comments"),
    body: v.string(),
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const body = args.body.trim();
    const userEmail = args.userEmail.trim().toLowerCase();
    if (body.length < 3) throw new Error("El comentario necesita al menos 3 caracteres.");
    if (body.length > 1200) throw new Error("El comentario no puede superar 1200 caracteres.");

    const comment = await ctx.db.get(args.id);
    if (!comment) throw new Error("Comentario no disponible.");
    if (comment.userEmail !== userEmail) throw new Error("Solo puedes editar tus propios comentarios.");

    await ctx.db.patch(args.id, {
      body,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: {
    id: v.id("comments"),
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const userEmail = args.userEmail.trim().toLowerCase();
    const comment = await ctx.db.get(args.id);
    if (!comment) throw new Error("Comentario no disponible.");

    const canRemove = comment.userEmail === userEmail || await isAdmin(ctx, userEmail);
    if (!canRemove) throw new Error("Solo puedes borrar tus comentarios.");

    await deleteCommentTree(ctx, args.id);
  },
});

export const report = mutation({
  args: {
    id: v.id("comments"),
    userEmail: v.string(),
    reason: v.string(),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const reporterEmail = args.userEmail.trim().toLowerCase();
    const reason = args.reason.trim();
    const details = args.details?.trim();
    if (!reason) throw new Error("Selecciona un motivo para la denuncia.");
    if (details && details.length > 500) throw new Error("El detalle no puede superar 500 caracteres.");
    if (await isAdmin(ctx, reporterEmail)) throw new Error("Los administradores resuelven denuncias desde el panel.");

    const comment = await ctx.db.get(args.id);
    if (!comment) throw new Error("Comentario no disponible.");
    if (comment.userEmail === reporterEmail) throw new Error("No puedes denunciar tu propio comentario.");

    const existingReports = await ctx.db
      .query("commentReports")
      .withIndex("by_reporter_comment", (q) => q.eq("reporterEmail", reporterEmail).eq("commentId", args.id))
      .collect();
    if (existingReports.some((reportRow) => reportRow.status === "pending")) {
      throw new Error("Ya enviaste una denuncia pendiente para este comentario.");
    }

    await ctx.db.insert("commentReports", {
      commentId: args.id,
      reporterEmail,
      reason,
      details,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

export const listReports = query({
  args: {
    adminEmail: v.string(),
  },
  handler: async (ctx, args) => {
    if (!(await isAdmin(ctx, args.adminEmail))) throw new Error("Solo administradores pueden ver denuncias.");
    const reports = await ctx.db
      .query("commentReports")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    const reporterEmails = Array.from(new Set(reports.map((reportRow) => reportRow.reporterEmail).filter(Boolean)));
    const reporterNames = new Map();
    for (const email of reporterEmails) {
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", email))
        .first();
      const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
      reporterNames.set(email, name || email);
    }
    const grouped = new Map();

    for (const reportRow of reports) {
      const comment = await ctx.db.get(reportRow.commentId);
      if (!comment) continue;
      const current = grouped.get(reportRow.commentId) ?? {
        comment: {
          ...comment,
          authorIsAdmin: await isAdmin(ctx, comment.userEmail),
        },
        reports: [],
      };
      current.reports.push({
        ...reportRow,
        reporterName: reporterNames.get(reportRow.reporterEmail) ?? reportRow.reporterEmail,
      });
      grouped.set(reportRow.commentId, current);
    }

    return Array.from(grouped.values())
      .map((item) => ({
        ...item,
        reports: item.reports.sort((left, right) => right.createdAt - left.createdAt),
      }))
      .sort((left, right) => right.reports[0].createdAt - left.reports[0].createdAt);
  },
});

export const resolveReport = mutation({
  args: {
    commentId: v.id("comments"),
    adminEmail: v.string(),
    action: v.union(v.literal("dismiss"), v.literal("delete")),
  },
  handler: async (ctx, args) => {
    const adminEmail = args.adminEmail.trim().toLowerCase();
    if (!(await isAdmin(ctx, adminEmail))) throw new Error("Solo administradores pueden resolver denuncias.");
    const status = args.action === "delete" ? "deleted" : "dismissed";
    const reports = await ctx.db
      .query("commentReports")
      .withIndex("by_comment", (q) => q.eq("commentId", args.commentId))
      .collect();
    const now = Date.now();

    for (const reportRow of reports.filter((item) => item.status === "pending")) {
      await ctx.db.patch(reportRow._id, {
        status,
        resolverEmail: adminEmail,
        resolvedAt: now,
      });
    }

    if (args.action === "delete") {
      const comment = await ctx.db.get(args.commentId);
      if (comment) await deleteCommentTree(ctx, args.commentId);
    }
  },
});

async function deleteCommentTree(ctx, commentId) {
  const replies = await ctx.db
    .query("comments")
    .withIndex("by_parent", (q) => q.eq("parentId", commentId))
    .collect();

  for (const reply of replies) {
    await deleteCommentTree(ctx, reply._id);
  }

  const likes = await ctx.db
    .query("commentLikes")
    .withIndex("by_comment", (q) => q.eq("commentId", commentId))
    .collect();
  for (const like of likes) {
    await ctx.db.delete(like._id);
  }

  const reports = await ctx.db
    .query("commentReports")
    .withIndex("by_comment", (q) => q.eq("commentId", commentId))
    .collect();
  for (const reportRow of reports) {
    await ctx.db.delete(reportRow._id);
  }

  await ctx.db.delete(commentId);
}
