/**
 * auth-session module — email token service
 *
 * All functions accept `db: PrismaClient` as first parameter.
 * No module-level prisma singleton import — module is portable.
 */

import crypto from "crypto";
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import type { ConsumeTokenResult } from "../models/types";

// ─── Token type constants ────────────────────────────────────

export const TOKEN_TYPE = {
  PASSWORD_RESET: "PASSWORD_RESET",
  EMAIL_VERIFICATION: "EMAIL_VERIFICATION",
  INVITE: "INVITE",
} as const;

export type TokenTypeValue = (typeof TOKEN_TYPE)[keyof typeof TOKEN_TYPE];

/** A rejected link, distinct from an infrastructure or database failure. */
export class InvalidEmailTokenError extends Error {
  constructor() {
    super("This link has expired or already been used");
    this.name = "InvalidEmailTokenError";
  }
}

// ─── Config ─────────────────────────────────────────────────

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Public API ─────────────────────────────────────────────

/**
 * Creates a secure random token, stores in DB with 24h expiry.
 * Returns the plain token string (caller includes it in an email link).
 */
export async function createEmailToken(
  db: PrismaClient,
  input: { userId: number; type: TokenTypeValue }
): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);

  await db.emailToken.create({
    data: {
      userId: input.userId,
      token,
      type: input.type,
      expiresAt,
    },
  });

  return token;
}

/**
 * Atomically marks token as consumed and returns { userId, type }.
 *
 * Throws if:
 * - Token not found
 * - Token already consumed (consumedAt is not null)
 * - Token expired (expiresAt <= now)
 * - Token does not match the expected purpose
 *
 * A conditional update guarantees single use under concurrent calls. Pass a
 * transaction client to commit consumption together with the protected write.
 */
export async function consumeEmailToken(
  db: PrismaClient | Prisma.TransactionClient,
  token: string,
  expectedType?: TokenTypeValue
): Promise<ConsumeTokenResult> {
  const record = await db.emailToken.findUnique({ where: { token } });
  const now = new Date();
  if (!record || record.consumedAt || record.expiresAt <= now ||
      (expectedType && record.type !== expectedType)) {
    throw new InvalidEmailTokenError();
  }

  const claimed = await db.emailToken.updateMany({
    where: {
      token,
      consumedAt: null,
      expiresAt: { gt: now },
      ...(expectedType ? { type: expectedType } : {}),
    },
    data: { consumedAt: now },
  });
  if (claimed.count !== 1) throw new InvalidEmailTokenError();

  return { userId: record.userId, type: record.type };
}
