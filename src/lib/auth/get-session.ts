import { getSession, COOKIE_NAME } from "@/modules/auth-session";
import { prisma } from "@/lib/db";
import { cookies } from "next/headers";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseError";
  }
}

export interface AuthenticatedUser {
  user: {
    id: number;
    email: string;
    fullName: string | null;
  };
}

/**
 * Get the authenticated user from the current JWT session cookie.
 * Returns null if not authenticated or session is invalid/expired.
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  let cookieStore;
  try {
    cookieStore = await cookies();
  } catch {
    return null;
  }

  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await getSession(prisma, token);
  if (!session) return null;

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, fullName: true },
    });
  } catch {
    throw new DatabaseError("Unable to connect to the database");
  }

  if (!user) return null;

  return { user };
}
