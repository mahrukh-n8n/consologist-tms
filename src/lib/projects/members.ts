import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { ProjectAccess, ProjectRole } from "@/generated/prisma/enums";
import { projectVisibilityWhere, canSeeAllProjects } from "./access";

type Db = PrismaClient;

export const addProjectMemberSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  userId: z.coerce.number().int().positive(),
});

export const removeProjectMemberSchema = addProjectMemberSchema;

export const setProjectMemberAccessSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  userId: z.coerce.number().int().positive(),
  accessOverride: z.nativeEnum(ProjectAccess),
});

export function listProjectMembers(db: Db, companyId: number, projectId: number) {
  return db.projectMember.findMany({
    where: { projectId, project: { group: { companyId } } },
    select: {
      id: true,
      role: true,
      accessOverride: true,
      userId: true,
      user: { select: { id: true, email: true, fullName: true } },
    },
    orderBy: [{ role: "asc" }, { id: "asc" }],
  });
}

/** Workspace members who are not yet on the project. */
export async function listAddableMembers(db: Db, companyId: number, projectId: number) {
  const existing = await db.projectMember.findMany({
    where: { projectId, project: { group: { companyId } } },
    select: { userId: true },
  });
  const taken = new Set(existing.map((row) => row.userId));
  const members = await db.userCompanyRole.findMany({
    where: { companyId },
    select: { user: { select: { id: true, email: true, fullName: true } } },
    orderBy: { createdAt: "asc" },
  });
  return members.map((row) => row.user).filter((user) => !taken.has(user.id));
}

/** Add a workspace member to a project. Idempotent. */
export async function gkAddProjectMember(
  db: Db,
  companyId: number,
  actorId: number,
  input: z.infer<typeof addProjectMemberSchema>
) {
  const project = await db.project.findFirst({
    where: { id: input.projectId, group: { companyId }, archivedAt: null },
    select: { id: true, name: true },
  });
  if (!project) throw new Error("Project not found in this workspace.");

  const workspaceMember = await db.userCompanyRole.findUnique({
    where: { userId_companyId: { userId: input.userId, companyId } },
    select: { userId: true },
  });
  if (!workspaceMember) throw new Error("That user is not a member of this workspace. Invite them first.");

  const existing = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId: project.id, userId: input.userId } },
    select: { id: true },
  });
  if (existing) return { id: existing.id, alreadyMember: true };

  const member = await db.projectMember.create({
    data: { projectId: project.id, userId: input.userId, role: ProjectRole.MEMBER },
    select: { id: true, userId: true, role: true },
  });
  await db.auditLog.create({
    data: {
      companyId,
      userId: actorId,
      tableName: "project_members",
      recordId: member.id,
      action: "CREATE",
      newValues: { projectId: project.id, userId: input.userId, role: member.role },
    },
  });
  return { id: member.id, alreadyMember: false };
}

/** Remove a project member. The project owner cannot be removed. */
export async function gkRemoveProjectMember(
  db: Db,
  companyId: number,
  actorId: number,
  input: z.infer<typeof removeProjectMemberSchema>
) {
  const project = await db.project.findFirst({
    where: { id: input.projectId, group: { companyId } },
    select: { id: true, ownerId: true },
  });
  if (!project) throw new Error("Project not found in this workspace.");
  if (project.ownerId === input.userId) throw new Error("The project owner cannot be removed.");

  const member = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId: project.id, userId: input.userId } },
    select: { id: true, role: true },
  });
  if (!member) throw new Error("That user is not a member of this project.");

  await db.projectMember.delete({ where: { id: member.id } });
  await db.auditLog.create({
    data: {
      companyId,
      userId: actorId,
      tableName: "project_members",
      recordId: member.id,
      action: "DELETE",
      oldValues: { projectId: project.id, userId: input.userId, role: member.role },
    },
  });
  return { id: member.id };
}

/** Resolve the project scope for a user's list queries. */
export async function projectScope(db: Db, companyId: number, userId: number) {
  const seeAll = await canSeeAllProjects(db, userId, companyId);
  return projectVisibilityWhere(companyId, userId, seeAll);
}


/** Change a member's per-project access override. Owner/admin workspace or project OWNER only. */
export async function gkSetProjectMemberAccess(
  db: Db,
  companyId: number,
  actorId: number,
  input: z.infer<typeof setProjectMemberAccessSchema>
) {
  const project = await db.project.findFirst({
    where: { id: input.projectId, group: { companyId } },
    select: { id: true, ownerId: true },
  });
  if (!project) throw new Error("Project not found in this workspace.");

  const actor = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId: project.id, userId: actorId } },
    select: { role: true },
  });
  const actorIsAdmin = await db.userCompanyRole.findUnique({
    where: { userId_companyId: { userId: actorId, companyId } },
    select: { role: true },
  });
  const canManage =
    ["ADMIN", "SUPER_ADMIN"].includes(actorIsAdmin?.role ?? "") ||
    actor?.role === ProjectRole.OWNER ||
    actor?.role === ProjectRole.ADMIN;
  if (!canManage) throw new Error("Only project owners or workspace admins can change project access.");

  const member = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId: project.id, userId: input.userId } },
    select: { id: true, role: true },
  });
  if (!member) throw new Error("That user is not a member of this project.");
  if (member.role === ProjectRole.OWNER && input.accessOverride !== ProjectAccess.INHERIT) {
    throw new Error("The project owner always has full access.");
  }

  const updated = await db.projectMember.update({
    where: { id: member.id },
    data: { accessOverride: input.accessOverride },
    select: { userId: true, accessOverride: true },
  });
  await db.auditLog.create({
    data: {
      companyId,
      userId: actorId,
      tableName: "project_members",
      recordId: member.id,
      action: "UPDATE",
      newValues: { projectId: project.id, userId: input.userId, accessOverride: input.accessOverride },
    },
  });
  return updated;
}
