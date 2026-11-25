import { requireAuth } from "@/lib/auth/require-auth";
import { getActiveCompany } from "./get-active-company";
import { getUserRole } from "@/lib/auth/get-user-role";
import { prisma } from "@/lib/db";
import type { Company, User } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { AuthError } from "@/lib/auth/get-session";

export interface AuthenticatedCompanyContext {
  user: User;
  company: Company;
}

export interface AuthenticatedCompanyContextWithRole extends AuthenticatedCompanyContext {
  userRole: Role | null;
}

/**
 * Require both authentication AND an active company context.
 *
 * Combines requireAuth() with getActiveCompany() for use in any
 * server component or server action that needs both user and company.
 *
 * @returns The authenticated user and active company
 */
export async function requireCompany(): Promise<AuthenticatedCompanyContext> {
  const { user: authUser } = await requireAuth();
  const fullUser = await prisma.user.findUnique({ where: { id: authUser.id } });
  if (!fullUser) throw new AuthError("User not found in local database");
  const company = await getActiveCompany(fullUser.id);
  return { user: fullUser, company };
}

/**
 * Like requireCompany() but also fetches the user's role.
 * Use this in server actions that pass auditContext to createScopedPrisma,
 * so that write audit log entries include the actor's role.
 */
export async function requireCompanyWithRole(): Promise<AuthenticatedCompanyContextWithRole> {
  const { user: authUser } = await requireAuth();
  const fullUser = await prisma.user.findUnique({ where: { id: authUser.id } });
  if (!fullUser) throw new AuthError("User not found in local database");
  const company = await getActiveCompany(fullUser.id);
  const userRole = await getUserRole(fullUser.id, company.id);
  return { user: fullUser, company, userRole };
}
