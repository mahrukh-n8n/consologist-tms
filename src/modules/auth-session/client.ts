/**
 * auth-session module — CLIENT-SAFE entry point
 *
 * Import from "@/modules/auth-session/client" in any "use client" component.
 * This barrel contains NO server-only dependencies (no Prisma, no Node built-ins).
 *
 * For server components and server actions, import from "@/modules/auth-session" instead.
 */

// Types (pure TypeScript — no runtime deps)
export type {
  SessionPayload,
  SessionData,
  AuthResult,
  ConsumeTokenResult,
} from "./models/types";

// Constants from services — TOKEN_TYPE and cookie config are plain objects/strings,
// safe to include as long as the files they come from have no server-only deps.
// tokens.ts imports crypto (Node built-in) so we re-export only the values we need
// from a safe re-export boundary. Since TOKEN_TYPE is a plain const object and
// we're in a client barrel, we define the values inline to avoid bundling crypto.
export const TOKEN_TYPE = {
  PASSWORD_RESET: "PASSWORD_RESET",
  EMAIL_VERIFICATION: "EMAIL_VERIFICATION",
  INVITE: "INVITE",
} as const;

export type TokenTypeValue = (typeof TOKEN_TYPE)[keyof typeof TOKEN_TYPE];

export const COOKIE_NAME = "auth-session";
export const COOKIE_MAX_AGE = 604800; // 7 days in seconds
