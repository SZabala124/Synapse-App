/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as academicTerms from "../academicTerms.js";
import type * as adminPasswordReset from "../adminPasswordReset.js";
import type * as adminPasswordResetInternal from "../adminPasswordResetInternal.js";
import type * as auth from "../auth.js";
import type * as comments from "../comments.js";
import type * as crons from "../crons.js";
import type * as devices from "../devices.js";
import type * as documents from "../documents.js";
import type * as flowData from "../flowData.js";
import type * as flows from "../flows.js";
import type * as http from "../http.js";
import type * as loginLimits from "../loginLimits.js";
import type * as paymentPricing from "../paymentPricing.js";
import type * as payments from "../payments.js";
import type * as profileSync from "../profileSync.js";
import type * as quarter from "../quarter.js";
import type * as quarterAccess from "../quarterAccess.js";
import type * as quarterScheduleSync from "../quarterScheduleSync.js";
import type * as quarterStats from "../quarterStats.js";
import type * as recoveryCredentials from "../recoveryCredentials.js";
import type * as recoveryCredentialsInternal from "../recoveryCredentialsInternal.js";
import type * as security from "../security.js";
import type * as storageActions from "../storageActions.js";
import type * as storageAuth from "../storageAuth.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  academicTerms: typeof academicTerms;
  adminPasswordReset: typeof adminPasswordReset;
  adminPasswordResetInternal: typeof adminPasswordResetInternal;
  auth: typeof auth;
  comments: typeof comments;
  crons: typeof crons;
  devices: typeof devices;
  documents: typeof documents;
  flowData: typeof flowData;
  flows: typeof flows;
  http: typeof http;
  loginLimits: typeof loginLimits;
  paymentPricing: typeof paymentPricing;
  payments: typeof payments;
  profileSync: typeof profileSync;
  quarter: typeof quarter;
  quarterAccess: typeof quarterAccess;
  quarterScheduleSync: typeof quarterScheduleSync;
  quarterStats: typeof quarterStats;
  recoveryCredentials: typeof recoveryCredentials;
  recoveryCredentialsInternal: typeof recoveryCredentialsInternal;
  security: typeof security;
  storageActions: typeof storageActions;
  storageAuth: typeof storageAuth;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
