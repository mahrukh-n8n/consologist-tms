/**
 * auth-session module — session service
 *
 * All functions accept `db: PrismaClient` as first parameter.
 * No module-level prisma singleton import — module is portable.
 * Throws at load time if JWT_SECRET is missing.
 */

import { SignJWT, jwtVerify } from "jose";
import type { PrismaClient } from "@/generated/prisma/client";
import type { SessionData, SessionPayload } from "../models/types";

// ─── Config ─────────────────────────────────────────────────

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  throw new Error(
    "JWT_SECRET environment variable is required but is not set. " +
      "Add JWT_SECRET to your .env file before starting the server."
  );
}

const SECRET_BYTES = new TextEncoder().encode(SECRET);

export const COOKIE_NAME = "auth-session";
export const COOKIE_MAX_AGE = 604800; // 7 days in seconds

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ROLL_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Helpers ────────────────────────────────────────────────

function expiresAt(): Date {
  return new Date(Date.now() + SESSION_DURATION_MS);
}

async function signJwt(payload: {
  userId: number;
  sessionId: string;
  email: string;
}): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET_BYTES);
}

async function verifyJwt(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_BYTES);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Creates a DB session row and returns a signed JWT.
 * Caller is responsible for setting the cookie.
 */
export async function createSession(
  db: PrismaClient,
  input: {
    userId: number;
    email: string;
    userAgent?: string;
    ipAddress?: string;
  }
): Promise<string> {
  const exp = expiresAt();

  const session = await db.session.create({
    data: {
      userId: input.userId,
      token: "", // placeholder — updated below with sessionId
      expiresAt: exp,
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  const jwt = await signJwt({
    userId: input.userId,
    sessionId: session.id,
    email: input.email,
  });

  // Store the JWT itself as the token so getSession can look it up
  await db.session.update({
    where: { id: session.id },
    data: { token: jwt },
  });

  return jwt;
}

/**
 * Verifies JWT signature and looks up session in DB.
 * Returns null if JWT is invalid, session not found, or session expired.
 */
export async function getSession(
  db: PrismaClient,
  token: string
): Promise<SessionData | null> {
  try {
    const payload = await verifyJwt(token);
    if (!payload) return null;

    const session = await db.session.findUnique({
      where: { token },
    });

    if (!session) return null;
    if (session.expiresAt < new Date()) return null;

    return {
      userId: session.userId,
      sessionId: session.id,
      email: payload.email,
      expiresAt: session.expiresAt,
    };
  } catch {
    return null;
  }
}

/**
 * Deletes a session row from DB (single-device logout).
 */
export async function destroySession(
  db: PrismaClient,
  sessionId: string
): Promise<void> {
  await db.session.delete({ where: { id: sessionId } }).catch(() => {
    // Session may already be deleted — ignore
  });
}

/**
 * Extends session expiry only if expiry is within 24h.
 * Avoids a DB write on every request.
 * Returns a new signed JWT, or null if no roll needed or session is invalid.
 */
export async function rollSession(
  db: PrismaClient,
  token: string
): Promise<string | null> {
  try {
    const payload = await verifyJwt(token);
    if (!payload) return null;

    const session = await db.session.findUnique({ where: { token } });
    if (!session) return null;
    if (session.expiresAt < new Date()) return null;

    const timeUntilExpiry = session.expiresAt.getTime() - Date.now();
    if (timeUntilExpiry >= ROLL_THRESHOLD_MS) return null; // no roll needed

    const newExp = expiresAt();
    const newJwt = await signJwt({
      userId: session.userId,
      sessionId: session.id,
      email: payload.email,
    });

    await db.session.update({
      where: { id: session.id },
      data: { token: newJwt, expiresAt: newExp },
    });

    return newJwt;
  } catch {
    return null;
  }
}
