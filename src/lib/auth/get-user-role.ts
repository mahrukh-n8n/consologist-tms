import { prisma } from "@/lib/db";
import type { Role } from "@/generated/prisma/client";

/**
 * Get the role of a user for a specific company.
 * Always fetched from the database -- never cached client-side.
 *
 * @param userId - The local user ID
 * @param companyId - The company ID to check role for
 * @returns The user's role, or null if no role exists
 */
export async function getUserRole(
  userId: number,
  companyId: number
): Promise<Role | null> {
  const userCompanyRole = await prisma.userCompanyRole.findUnique({
    where: {
      userId_companyId: {
        userId,
        companyId,
      },
    },
    select: {
      role: true,
    },
  });

  return userCompanyRole?.role ?? null;
}
