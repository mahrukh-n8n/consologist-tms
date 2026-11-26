import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ProjectRole, Role } from "@/generated/prisma/enums";

type Db = Pick<PrismaClient, "userCompanyRole" | "projectMember" | "project">;

export type EffectiveProjectAccess = "READ" | "COMMENT" | "WRITE";

/**
 * Project visibility.
 *
 * Workspace admins see every project. Everyone else sees only projects they
 * are a member of — project membership gates tasks, documents and files.
 */

export async function canSeeAllProjects(db: Db, userId: number, companyId: number): Promise<boolean> {
  const membership = await db.userCompanyRole.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: { role: true },
  });
  return membership?.role === Role.SUPER_ADMIN || membership?.role === Role.ADMIN;
}

export function projectVisibilityWhere(
  companyId: number,
  userId: number,
  seeAll: boolean
): Prisma.ProjectWhereInput {
  return {
    group: { companyId },
    ...(seeAll ? {} : { members: { some: { userId } } }),
  };
}

/** Throws unless the actor is a project member (workspace admins bypass). */
export async function assertProjectMember(
  db: Db,
  companyId: number,
  userId: number,
  projectId: number
): Promise<void> {
  const seeAll = await canSeeAllProjects(db, userId, companyId);
  if (seeAll) return;
  const member = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { id: true },
  });
  if (!member) throw new Error("You are not a member of this project.");
}

/** Throws unless the actor may see the project. */
export async function assertProjectAccess(
  db: Db,
  companyId: number,
  userId: number,
  projectId: number
): Promise<void> {
  const seeAll = await canSeeAllProjects(db, userId, companyId);
  const project = await db.project.findFirst({
    where: { id: projectId, ...projectVisibilityWhere(companyId, userId, seeAll) },
    select: { id: true },
  });
  if (!project) throw new Error("Project not found in this workspace.");
}


/**
 * Effective project access.
 *
 * Workspace admins -> WRITE. Project OWNER -> WRITE. Otherwise the member's
 * per-project override wins; INHERIT falls back to the workspace role.
 */
export async function getProjectAccess(
  db: Db,
  companyId: number,
  userId: number,
  projectId: number
): Promise<EffectiveProjectAccess | null> {
  if (await canSeeAllProjects(db, userId, companyId)) return "WRITE";

  const member = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true, accessOverride: true },
  });
  if (!member) return null;
  if (member.role === ProjectRole.OWNER) return "WRITE";

  switch (member.accessOverride) {
    case "READ_ONLY":
      return "READ";
    case "COMMENT":
      return "COMMENT";
    case "READ_WRITE":
      return "WRITE";
    case "INHERIT":
    default: {
      const workspace = await db.userCompanyRole.findUnique({
        where: { userId_companyId: { userId, companyId } },
        select: { role: true },
      });
      if (workspace?.role === Role.READ_ONLY) return "READ";
      if (workspace?.role === Role.COMMENT) return "COMMENT";
      return "WRITE";
    }
  }
}

export async function assertProjectWrite(
  db: Db,
  companyId: number,
  userId: number,
  projectId: number
): Promise<void> {
  const access = await getProjectAccess(db, companyId, userId, projectId);
  if (access === null) throw new Error("You are not a member of this project.");
  if (access !== "WRITE") throw new Error("You have read-only access to this project.");
}

export async function assertProjectComment(
  db: Db,
  companyId: number,
  userId: number,
  projectId: number
): Promise<void> {
  const access = await getProjectAccess(db, companyId, userId, projectId);
  if (access === null) throw new Error("You are not a member of this project.");
  if (access === "READ") throw new Error("You have read-only access to this project.");
}
