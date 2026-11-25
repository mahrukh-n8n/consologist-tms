import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import type { Company } from "@/generated/prisma/client";

const ACTIVE_COMPANY_COOKIE = "activeCompanyId";

/**
 * Get the active company for the authenticated user.
 *
 * Resolution order:
 * 1. Check cookie for activeCompanyId — verify user has a role
 * 2. Fall back to the first company the user belongs to
 * 3. If user has no companies, redirect to company creation
 *
 * @param userId - The authenticated user's ID
 * @returns The active Company record
 */
export async function getActiveCompany(userId: number): Promise<Company> {
  const cookieStore = await cookies();
  const activeCompanyIdStr = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value;

  // 1. If cookie has an activeCompanyId, verify the user has a role
  if (activeCompanyIdStr) {
    const activeCompanyId = parseInt(activeCompanyIdStr, 10);
    if (!isNaN(activeCompanyId)) {
      const role = await prisma.userCompanyRole.findUnique({
        where: {
          userId_companyId: { userId, companyId: activeCompanyId },
        },
        include: { company: true },
      });

      if (role) {
        return role.company;
      }
    }
  }

  // 2. Fall back to the first company the user belongs to
  const firstRole = await prisma.userCompanyRole.findFirst({
    where: { userId },
    include: { company: true },
    orderBy: { createdAt: "asc" },
  });

  if (firstRole) {
    return firstRole.company;
  }

  // 3. Check for pending invitations — redirect to accept page if found
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (user) {
    const pendingInvitation = await prisma.invitation.findFirst({
      where: {
        email: user.email,
        accepted: false,
        expiresAt: { gt: new Date() },
      },
      select: { token: true },
    });

    if (pendingInvitation) {
      redirect(`/accept-invite?token=${pendingInvitation.token}`);
    }
  }

  // 4. User has no companies and no invitations — redirect to creation
  redirect("/companies/new");
}
