import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";

type Db = PrismaClient;

export const removeWorkspaceMemberSchema = z.object({
  userId: z.coerce.number().int().positive(),
});

/**
 * Remove a member from the workspace.
 *
 * Guards: admin actor, not self, not a project owner, never the last super admin.
 * Removes project memberships, permission assignment/overrides and task
 * assignments in this workspace. The user account itself is kept.
 */
export async function removeWorkspaceMember(
  db: Db,
  input: { companyId: number; actorId: number; targetUserId: number }
) {
  if (input.actorId === input.targetUserId) throw new Error("You cannot remove your own workspace access.");

  const actor = await db.userCompanyRole.findUnique({
    where: { userId_companyId: { userId: input.actorId, companyId: input.companyId } },
    select: { role: true },
  });
  if (!actor || !["ADMIN", "SUPER_ADMIN"].includes(actor.role)) {
    throw new Error("Only workspace admins can remove members.");
  }

  const target = await db.userCompanyRole.findUnique({
    where: { userId_companyId: { userId: input.targetUserId, companyId: input.companyId } },
    select: { role: true },
  });
  if (!target) throw new Error("That user is not a member of this workspace.");

  if (target.role === "SUPER_ADMIN") {
    const supers = await db.userCompanyRole.count({
      where: { companyId: input.companyId, role: "SUPER_ADMIN" },
    });
    if (supers <= 1) throw new Error("The workspace must keep at least one super admin.");
  }

  const ownedProject = await db.project.findFirst({
    where: { ownerId: input.targetUserId, group: { companyId: input.companyId } },
    select: { id: true, name: true },
  });
  if (ownedProject) {
    throw new Error(`Transfer ownership of "${ownedProject.name}" before removing this member.`);
  }

  return db.$transaction(async (tx) => {
    const projects = await tx.project.findMany({
      where: { group: { companyId: input.companyId } },
      select: { id: true },
    });
    const projectIds = projects.map((project) => project.id);

    await tx.taskAssignee.deleteMany({
      where: {
        userId: input.targetUserId,
        task: { projectId: { in: projectIds } },
      },
    });
    await tx.projectMember.deleteMany({
      where: { userId: input.targetUserId, projectId: { in: projectIds } },
    });
    await tx.userPermissionOverride.deleteMany({
      where: { userId: input.targetUserId, companyId: input.companyId },
    });
    await tx.userPermissionAssignment.deleteMany({
      where: { userId: input.targetUserId, companyId: input.companyId },
    });
    await tx.userCompanyRole.delete({
      where: { userId_companyId: { userId: input.targetUserId, companyId: input.companyId } },
    });
    await tx.auditLog.create({
      data: {
        companyId: input.companyId,
        userId: input.actorId,
        tableName: "user_company_roles",
        recordId: input.targetUserId,
        action: "DELETE",
        oldValues: { userId: input.targetUserId, role: target.role },
      },
    });
    return { removed: true, userId: input.targetUserId };
  });
}
