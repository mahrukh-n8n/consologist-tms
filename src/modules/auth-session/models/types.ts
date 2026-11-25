/**
 * auth-session module — types
 * No Prisma imports. No Node APIs. Safe for client barrel.
 */

export interface SessionPayload {
  userId: number;
  sessionId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface SessionData {
  userId: number;
  sessionId: string;
  email: string;
  expiresAt: Date;
}

export type AuthResult =
  | { success: true; userId: number; sessionId: string }
  | { success: false; error: string };

export interface ConsumeTokenResult {
  userId: number;
  type: string;
}

