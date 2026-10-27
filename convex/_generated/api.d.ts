/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as MacalyGoogle from "../MacalyGoogle.js";
import type * as ResendOTP from "../ResendOTP.js";
import type * as auth from "../auth.js";
import type * as authUsers from "../authUsers.js";
import type * as authz from "../authz.js";
import type * as bankStatements from "../bankStatements.js";
import type * as commandCenter from "../commandCenter.js";
import type * as crons from "../crons.js";
import type * as financeIntake from "../financeIntake.js";
import type * as googleAuth from "../googleAuth.js";
import type * as http from "../http.js";
import type * as liveBriefing from "../liveBriefing.js";
import type * as macaly from "../macaly.js";
import type * as wofFinance from "../wofFinance.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  MacalyGoogle: typeof MacalyGoogle;
  ResendOTP: typeof ResendOTP;
  auth: typeof auth;
  authUsers: typeof authUsers;
  authz: typeof authz;
  bankStatements: typeof bankStatements;
  commandCenter: typeof commandCenter;
  crons: typeof crons;
  financeIntake: typeof financeIntake;
  googleAuth: typeof googleAuth;
  http: typeof http;
  liveBriefing: typeof liveBriefing;
  macaly: typeof macaly;
  wofFinance: typeof wofFinance;
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
