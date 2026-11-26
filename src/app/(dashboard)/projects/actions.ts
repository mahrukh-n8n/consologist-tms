"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { requireWriteGate } from "@/modules/auth-rbac/middleware/page-access";
import { createGroupSchema, createProjectSchema, createGroupAndNotify, gkCreateProject } from "@/lib/projects/service";
import { addProjectMemberSchema, gkAddProjectMember, gkRemoveProjectMember, gkSetProjectMemberAccess, removeProjectMemberSchema, setProjectMemberAccessSchema } from "@/lib/projects/members";

export type ProjectState = { success: boolean; error?: string };

export async function createGroupAction(_prev: ProjectState, formData: FormData): Promise<ProjectState> {
  const { user, company } = await requireCompany();
  try {
    const gate = await requireWriteGate(user.id, company.id, "projects");
    const parsed = createGroupSchema.safeParse({ name: formData.get("name") });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid group." };
    if (gate.needsApproval) {
      await prisma.pendingApproval.create({
        data: { companyId: company.id, entityType: "projects.create_group", pageKey: "projects", payload: parsed.data, displayPayload: { name: parsed.data.name }, submittedBy: user.id },
      });
      return { success: true };
    }
    await createGroupAndNotify(prisma, company.id, user.id, parsed.data.name);
    revalidatePath("/projects");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Group creation failed." };
  }
}

export async function createProjectAction(_prev: ProjectState, formData: FormData): Promise<ProjectState> {
  const { user, company } = await requireCompany();
  try {
    const gate = await requireWriteGate(user.id, company.id, "projects");
    const parsed = createProjectSchema.safeParse({
      groupId: formData.get("groupId"),
      name: formData.get("name"),
      description: formData.get("description") ?? "",
    });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid project." };
    if (gate.needsApproval) {
      await prisma.pendingApproval.create({
        data: { companyId: company.id, entityType: "projects.create_project", pageKey: "projects", payload: parsed.data, displayPayload: { name: parsed.data.name }, submittedBy: user.id },
      });
      return { success: true };
    }
    await gkCreateProject(prisma, company.id, user.id, parsed.data);
    revalidatePath("/projects");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Project creation failed." };
  }
}

export async function addProjectMemberAction(_prev: ProjectState, formData: FormData): Promise<ProjectState> {
  const { user, company } = await requireCompany();
  try {
    const gate = await requireWriteGate(user.id, company.id, "projects");
    const parsed = addProjectMemberSchema.safeParse({
      projectId: formData.get("projectId"),
      userId: formData.get("userId"),
    });
    if (!parsed.success) return { success: false, error: "Choose a workspace member." };
    if (gate.needsApproval) {
      await prisma.pendingApproval.create({
        data: { companyId: company.id, entityType: "projects.add_member", pageKey: "projects", payload: parsed.data, submittedBy: user.id },
      });
      return { success: true };
    }
    await gkAddProjectMember(prisma, company.id, user.id, parsed.data);
    revalidatePath("/projects");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not add the member." };
  }
}

export async function removeProjectMemberAction(_prev: ProjectState, formData: FormData): Promise<ProjectState> {
  const { user, company } = await requireCompany();
  try {
    const gate = await requireWriteGate(user.id, company.id, "projects");
    const parsed = removeProjectMemberSchema.safeParse({
      projectId: formData.get("projectId"),
      userId: formData.get("userId"),
    });
    if (!parsed.success) return { success: false, error: "Invalid member." };
    if (gate.needsApproval) {
      await prisma.pendingApproval.create({
        data: { companyId: company.id, entityType: "projects.remove_member", pageKey: "projects", payload: parsed.data, submittedBy: user.id },
      });
      return { success: true };
    }
    await gkRemoveProjectMember(prisma, company.id, user.id, parsed.data);
    revalidatePath("/projects");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not remove the member." };
  }
}

export async function setProjectMemberAccessAction(_prev: ProjectState, formData: FormData): Promise<ProjectState> {
  const { user, company } = await requireCompany();
  try {
    await requireWriteGate(user.id, company.id, "projects");
    const parsed = setProjectMemberAccessSchema.safeParse({
      projectId: formData.get("projectId"),
      userId: formData.get("userId"),
      accessOverride: formData.get("accessOverride"),
    });
    if (!parsed.success) return { success: false, error: "Invalid access level." };
    await gkSetProjectMemberAccess(prisma, company.id, user.id, parsed.data);
    revalidatePath("/projects");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Access not changed." };
  }
}
