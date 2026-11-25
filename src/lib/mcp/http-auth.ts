/**
 * MCP HTTP Auth Utilities
 *
 * JWT-based session management and brute force protection for the HTTP transport.
 * - FailedAttemptStore: in-memory IP brute force protection
 * - JWT session token generation/verification
 *
 * Uses `jose` for JWT (already in package.json).
 */

import { SignJWT, jwtVerify } from "jose";

// ─── Brute Force Protection ───────────────────────────────────────────────

const BAN_DURATION_MS = 60 * 60 * 1000; // 1 hour
const ATTEMPT_DELAY_MS = 60 * 1000; // 1 minute between attempts
const MAX_FAILED_ATTEMPTS = 3;

class FailedAttemptStore {
  private attempts = new Map<string, number[]>();
  private banned = new Map<string, number>(); // ip -> bannedUntil timestamp
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    if (typeof this.cleanupInterval.unref === "function") {
      this.cleanupInterval.unref();
    }
  }

  recordFailedAttempt(ip: string): void {
    const now = Date.now();
    const existing = this.attempts.get(ip) || [];
    existing.push(now);
    this.attempts.set(ip, existing);

    if (existing.length >= MAX_FAILED_ATTEMPTS) {
      this.banned.set(ip, now + BAN_DURATION_MS);
    }
  }

  recordSuccessfulAttempt(ip: string): void {
    this.attempts.delete(ip);
  }

  getFailedAttempts(ip: string): number {
    const now = Date.now();
    const existing = this.attempts.get(ip) || [];
    // Only count attempts within the delay window
    return existing.filter((t) => now - t < ATTEMPT_DELAY_MS).length;
  }

  isIpBanned(ip: string): boolean {
    const bannedUntil = this.banned.get(ip);
    if (!bannedUntil) return false;
    if (Date.now() > bannedUntil) {
      this.banned.delete(ip);
      return false;
    }
    return true;
  }

  canAttempt(ip: string): { allowed: boolean; reason?: string; retryAfterMs?: number } {
    if (this.isIpBanned(ip)) {
      const bannedUntil = this.banned.get(ip)!;
      return {
        allowed: false,
        reason: "IP is temporarily banned due to too many failed attempts",
        retryAfterMs: Math.max(bannedUntil - Date.now(), 0),
      };
    }

    const recentAttempts = this.getFailedAttempts(ip);

    // Enforce 1-minute cooldown after ANY failed attempt
    const attempts = this.attempts.get(ip) || [];
    const lastAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : 0;
    const timeSinceLast = Date.now() - (lastAttempt || 0);
    if (timeSinceLast < ATTEMPT_DELAY_MS && recentAttempts > 0) {
      return {
        allowed: false,
        reason: "Too many failed attempts, please wait before trying again",
        retryAfterMs: ATTEMPT_DELAY_MS - timeSinceLast,
      };
    }

    if (recentAttempts >= MAX_FAILED_ATTEMPTS) {
      return { allowed: false, reason: "Maximum failed attempts reached — IP banned" };
    }

    return { allowed: true };
  }

  private cleanup(): void {
    const now = Date.now();

    // Clean old attempts
    for (const [ip, timestamps] of this.attempts.entries()) {
      const recent = timestamps.filter((t) => now - t < ATTEMPT_DELAY_MS * 2);
      if (recent.length === 0) {
        this.attempts.delete(ip);
      } else {
        this.attempts.set(ip, recent);
      }
    }

    // Clean expired bans
    for (const [ip, bannedUntil] of this.banned.entries()) {
      if (now > bannedUntil) {
        this.banned.delete(ip);
      }
    }
  }
}

export const failedAttemptStore = new FailedAttemptStore();

// ─── JWT Session Management ───────────────────────────────────────────────

export interface McpJwtPayload {
  userId: number;
  companyId: number;
  apiKeyId: number;
}

const DEFAULT_JWT_EXPIRY = 86400; // 24 hours (remote agents need longer sessions)

function getJwtSecret(): Uint8Array {
  const secret = process.env.MCP_JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      "MCP_JWT_SECRET or NEXTAUTH_SECRET environment variable is required for MCP session tokens"
    );
  }
  return new TextEncoder().encode(secret);
}

function getJwtExpiry(): number {
  return parseInt(process.env.MCP_JWT_EXPIRY || String(DEFAULT_JWT_EXPIRY), 10);
}

export async function generateMcpSessionToken(payload: McpJwtPayload & { apiKeyId: number }): Promise<string> {
  const secret = getJwtSecret();
  const expiry = getJwtExpiry();

  const token = await new SignJWT({
    userId: payload.userId,
    companyId: payload.companyId,
    apiKeyId: payload.apiKeyId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${expiry}s`)
    .sign(secret);

  return token;
}

export async function verifyMcpSessionToken(token: string): Promise<McpJwtPayload & { apiKeyId: number; needsRefresh: boolean }> {
  const secret = getJwtSecret();

  try {
    const { payload } = await jwtVerify(token, secret);

    const userId = payload.userId as number | undefined;
    const companyId = payload.companyId as number | undefined;
    const apiKeyId = payload.apiKeyId as number | undefined;

    if (!userId || !companyId || !apiKeyId) {
      throw new Error("Invalid token payload");
    }

    // Sliding refresh: if token is past half its lifetime, flag for re-issue
    const iat = payload.iat ?? 0;
    const exp = payload.exp ?? 0;
    const now = Math.floor(Date.now() / 1000);
    const halfLife = iat + Math.floor((exp - iat) / 2);
    const needsRefresh = now >= halfLife;

    return { userId, companyId, apiKeyId, needsRefresh };
  } catch (err) {
    if (err instanceof Error && err.name === "JWTExpired") {
      throw new Error("MCP session has expired");
    }
    throw new Error("Invalid MCP session token");
  }
}

// ─── IP Extraction ────────────────────────────────────────────────────────

export function extractClientIp(headers: Headers): string {
  // Check standard proxy headers in order
  const xForwardedFor = headers.get("x-forwarded-for");
  if (xForwardedFor) {
    // Take the first IP (original client)
    return xForwardedFor.split(",")[0]!.trim();
  }

  const xRealIp = headers.get("x-real-ip");
  if (xRealIp) {
    return xRealIp.trim();
  }

  return "unknown";
}
