import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import { Role as Roles } from "@/generated/prisma/enums";
import { sendInvitationEmail } from "@/lib/email";
import { APP_NAME, APP_URL } from "@/lib/app";

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

export const inviteUserSchema = z.object({
  email: z.string().trim().email("A valid email is required."),
  role: z.nativeEnum(Roles).default(Roles.WRITE),
});

export const revokeInvitationSchema = z.object({
  invitationId: z.coerce.number().int().positive(),
});

export function listWorkspaceUsers(db: Db, companyId: number) {
  return db.userCompanyRole.findMany({
    where: { companyId },
    include: { user: { select: { id: true, email: true, fullName: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export function listWorkspaceInvitations(db: Db, companyId: number) {
  return db.invitation.findMany({
    where: { companyId, accepted: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
}

/** Gatekeeper for creating an invitation. Used by GUI and MCP. */
export async function gkInviteUser(
  tx: Tx,
  input: { companyId: number; inviterId: number; email: string; role: Roles }
) {
  const email = input.email.trim().toLowerCase();
  const existing = await tx.invitation.findFirst({
    where: { companyId: input.companyId, email, accepted: false, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  if (existing) throw new Error("An active invitation already exists for this email.");

  let invitee = await tx.user.findUnique({ where: { email }, select: { id: true } });
  if (!invitee) {
    invitee = await tx.user.create({
      data: { email, fullName: email.split("@")[0] ?? email },
      select: { id: true },
    });
  }

  return tx.invitation.create({
    data: {
      companyId: input.companyId,
      email,
      role: input.role,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      invitedBy: input.inviterId,
    },
  });
}

/** Shared orchestration: gatekeeper commit, then best-effort email. */
export async function inviteWorkspaceUser(
  db: Db,
  input: { companyId: number; inviterId: number; inviterName: string; email: string; role: Roles }
) {
  const invitation = await db.$transaction((tx) =>
    gkInviteUser(tx, {
      companyId: input.companyId,
      inviterId: input.inviterId,
      email: input.email,
      role: input.role,
    })
  );
  try {
    await sendInvitationEmail({
      to: invitation.email,
      inviteUrl: `${APP_URL}/accept-invite?token=${invitation.token}`,
      inviterName: input.inviterName,
      appName: APP_NAME,
      appUrl: APP_URL,
    });
  } catch (error) {
    console.error("Invitation email failed:", error);
  }
  return invitation;
}

export async function revokeWorkspaceInvitation(
  db: Db,
  input: { companyId: number; invitationId: number }
) {
  const result = await db.invitation.deleteMany({
    where: { id: input.invitationId, companyId: input.companyId, accepted: false },
  });
  if (result.count !== 1) throw new Error("Invitation not found.");
}
