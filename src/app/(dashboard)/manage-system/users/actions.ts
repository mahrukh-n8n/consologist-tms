"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { requirePageWrite } from "@/modules/auth-rbac/middleware/page-access";
import {
  inviteUserSchema,
  inviteWorkspaceUser,
  revokeInvitationSchema,
  revokeWorkspaceInvitation,
} from "@/lib/users/membership";
import { removeWorkspaceMember, removeWorkspaceMemberSchema } from "@/lib/users/removal";

export type InviteState = { success: boolean; error?: string };

export async function inviteUserAction(
  _prev: InviteState,
  formData: FormData
): Promise<InviteState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "manage-system-users");
    const parsed = inviteUserSchema.safeParse({
      email: formData.get("email"),
      role: formData.get("role") ?? "WRITE",
    });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid invitation." };

    await inviteWorkspaceUser(prisma, {
      companyId: company.id,
      inviterId: user.id,
      inviterName: user.fullName,
      email: parsed.data.email,
      role: parsed.data.role,
    });
    revalidatePath("/manage-system/users");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Invitation failed." };
  }
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const { user, company } = await requireCompany();
  await requirePageWrite(user.id, company.id, "manage-system-users");
  const parsed = revokeInvitationSchema.safeParse({ invitationId: formData.get("id") });
  if (!parsed.success) throw new Error("Invalid invitation id.");
  await revokeWorkspaceInvitation(prisma, {
    companyId: company.id,
    invitationId: parsed.data.invitationId,
  });
  revalidatePath("/manage-system/users");
}

export type RemoveMemberState = { success: boolean; error?: string };

export async function removeWorkspaceMemberAction(_prev: RemoveMemberState, formData: FormData): Promise<RemoveMemberState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "manage-system-users");
    const parsed = removeWorkspaceMemberSchema.safeParse({ userId: formData.get("userId") });
    if (!parsed.success) return { success: false, error: "Invalid member." };
    await removeWorkspaceMember(prisma, {
      companyId: company.id,
      actorId: user.id,
      targetUserId: parsed.data.userId,
    });
    revalidatePath("/manage-system/users");
    revalidatePath("/projects");
    revalidatePath("/tasks");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Member not removed." };
  }
}
