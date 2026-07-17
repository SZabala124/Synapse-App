import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { assertAdmin } from "./users";

const PLAN_PRICES = {
  pro: { monthly: 3, quarterly: 6 },
  excellence: { monthly: 4, quarterly: 8 },
};

const BANKS = [
  ["0102", "Banco de Venezuela"],
  ["0104", "Venezolano de Credito"],
  ["0105", "Mercantil"],
  ["0108", "Provincial"],
  ["0114", "Bancaribe"],
  ["0115", "Banco Exterior"],
  ["0128", "Banco Caroni"],
  ["0134", "Banesco"],
  ["0137", "Sofitasa"],
  ["0138", "Banco Plaza"],
  ["0151", "BFC Banco Fondo Comun"],
  ["0156", "100% Banco"],
  ["0163", "Banco del Tesoro"],
  ["0166", "Banco Agricola de Venezuela"],
  ["0168", "Bancrecer"],
  ["0169", "Mi Banco"],
  ["0171", "Banco Activo"],
  ["0172", "Bancamiga"],
  ["0174", "Banplus"],
  ["0175", "Banco Bicentenario"],
  ["0191", "Banco Nacional de Credito"],
];

export const banks = query({
  args: {},
  handler: async () => BANKS.map(([code, name]) => ({ code, name, label: `${name} (${code})` })),
});

export const getBcvRate = action({
  args: {},
  handler: async () => {
    try {
      const response = await fetch("https://ve.dolarapi.com/v1/dolares/oficial", {
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error(`BCV rate request failed: ${response.status}`);
      const data = await response.json();
      const rawRate = Number(data?.promedio ?? data?.venta ?? data?.precio);
      if (!Number.isFinite(rawRate) || rawRate <= 0) throw new Error("BCV rate response did not include a valid rate.");
      return {
        rate: roundMoney(rawRate),
        source: "DolarApi - Oficial",
        updatedAt: data?.fechaActualizacion ?? data?.fecha ?? new Date().toISOString(),
      };
    } catch (error) {
      return {
        rate: 0,
        source: "No disponible",
        updatedAt: new Date().toISOString(),
        error: error?.message ?? "No se pudo consultar la tasa BCV.",
      };
    }
  },
});

export const myPending = query({
  args: {
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const userEmail = normalizeEmail(args.userEmail);
    const rows = await ctx.db
      .query("paymentRequests")
      .withIndex("by_user_created", (q) => q.eq("userEmail", userEmail))
      .order("desc")
      .take(10);
    return rows.find((row) => row.status === "pending") ?? null;
  },
});

export const listForAdmin = query({
  args: {
    adminEmail: v.string(),
    status: v.optional(v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"), v.literal("all"))),
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx, args.adminEmail);
    const status = args.status ?? "pending";
    const rows = status === "all"
      ? await ctx.db.query("paymentRequests").order("desc").take(120)
      : await ctx.db
        .query("paymentRequests")
        .withIndex("by_status_created", (q) => q.eq("status", status))
        .order("desc")
        .take(120);
    return rows;
  },
});

export const pendingCount = query({
  args: {
    adminEmail: v.string(),
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx, args.adminEmail);
    const rows = await ctx.db
      .query("paymentRequests")
      .withIndex("by_status_created", (q) => q.eq("status", "pending"))
      .take(200);
    return rows.length;
  },
});

export const create = mutation({
  args: {
    userEmail: v.string(),
    userName: v.optional(v.string()),
    plan: v.union(v.literal("pro"), v.literal("excellence")),
    billingPeriod: v.union(v.literal("monthly"), v.literal("quarterly")),
    amountBs: v.number(),
    bcvRate: v.optional(v.number()),
    payerPhone: v.string(),
    bankCode: v.string(),
    referenceLast4: v.string(),
  },
  handler: async (ctx, args) => {
    const userEmail = normalizeEmail(args.userEmail);
    const amountUsd = PLAN_PRICES[args.plan]?.[args.billingPeriod];
    if (!amountUsd) throw new Error("Plan de pago invalido.");
    if (!isVenezuelanPhone(args.payerPhone)) throw new Error("El telefono debe ser venezolano y tener 11 digitos.");
    if (!/^\d{4}$/.test(args.referenceLast4)) throw new Error("La referencia debe tener exactamente 4 digitos.");
    if (!Number.isFinite(args.amountBs) || args.amountBs <= 0) throw new Error("El monto en Bs no es valido.");
    const bank = BANKS.find(([code]) => code === args.bankCode);
    if (!bank) throw new Error("Selecciona un banco valido.");

    const activePending = await ctx.db
      .query("paymentRequests")
      .withIndex("by_user_created", (q) => q.eq("userEmail", userEmail))
      .order("desc")
      .take(10);
    if (activePending.some((row) => row.status === "pending")) {
      throw new Error("Ya tienes un pago pendiente por verificar.");
    }

    const now = Date.now();
    return await ctx.db.insert("paymentRequests", {
      userEmail,
      userName: args.userName?.trim() || undefined,
      plan: args.plan,
      billingPeriod: args.billingPeriod,
      amountUsd,
      bcvRate: normalizeOptionalRate(args.bcvRate),
      amountBs: roundMoney(args.amountBs),
      payerPhone: args.payerPhone.trim(),
      bankCode: bank[0],
      bankName: bank[1],
      referenceLast4: args.referenceLast4,
      status: "pending",
      createdAt: now,
    });
  },
});

export const approve = mutation({
  args: {
    adminEmail: v.string(),
    paymentId: v.id("paymentRequests"),
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx, args.adminEmail);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Pago no encontrado.");
    if (payment.status !== "pending") throw new Error("Este pago ya fue resuelto.");

    const users = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", payment.userEmail))
      .collect();
    if (users.length > 0) {
      for (const user of users) {
        await ctx.db.patch(user._id, { plan: payment.plan });
      }
    } else {
      await ctx.db.insert("users", {
        email: payment.userEmail,
        userType: "user",
        plan: payment.plan,
      });
    }

    await ctx.db.patch(args.paymentId, {
      status: "approved",
      adminEmail: normalizeEmail(args.adminEmail),
      resolvedAt: Date.now(),
    });
    return { ok: true, plan: payment.plan, userEmail: payment.userEmail };
  },
});

export const reject = mutation({
  args: {
    adminEmail: v.string(),
    paymentId: v.id("paymentRequests"),
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx, args.adminEmail);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Pago no encontrado.");
    if (payment.status !== "pending") throw new Error("Este pago ya fue resuelto.");
    await ctx.db.patch(args.paymentId, {
      status: "rejected",
      adminEmail: normalizeEmail(args.adminEmail),
      resolvedAt: Date.now(),
    });
    return { ok: true };
  },
});

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function isVenezuelanPhone(value) {
  return /^0(2\d{2}|4(12|14|16|24|26))\d{7}$/.test(String(value ?? "").trim());
}

function normalizeOptionalRate(value) {
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? roundMoney(rate) : undefined;
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}
