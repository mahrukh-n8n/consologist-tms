import type { McpToolDefinition } from "@/lib/mcp/types";
import {
  inviteUserSchema,
  inviteWorkspaceUser,
  listWorkspaceInvitations,
  listWorkspaceUsers,
  revokeInvitationSchema,
  revokeWorkspaceInvitation,
} from "@/lib/users/membership";
import { commitResult, dataResult } from "@/modules/mcp/utils/serialize";
import type { Role } from "@/generated/prisma/enums";

export const userTools: McpToolDefinition[] = [
  {
    name: "users.list",
    description: "List workspace members and pending invitations.",
    inputSchema: revokeInvitationSchema.partial().transform(() => ({})),
    requiredPageKey: "manage-system-users",
    accessLevel: "READ",
    async handler(ctx) {
      const [members, invitations] = await Promise.all([
        listWorkspaceUsers(ctx.db, ctx.companyId),
        listWorkspaceInvitations(ctx.db, ctx.companyId),
      ]);
      return dataResult({ members, invitations });
    },
  },
  {
    name: "users.invite",
    description: "Invite a user by email with a role. The invitation email contains a one-time link.",
    inputSchema: inviteUserSchema,
    requiredPageKey: "manage-system-users",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      const data = input as { email: string; role: Role };
      const inviter = await ctx.db.user.findUnique({
        where: { id: ctx.userId },
        select: { fullName: true },
      });
      const invitation = await inviteWorkspaceUser(ctx.db, {
        companyId: ctx.companyId,
        inviterId: ctx.userId,
        inviterName: inviter?.fullName ?? "A teammate",
        email: data.email,
        role: data.role,
      });
      return commitResult({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt.toISOString(),
      });
    },
  },
  {
    name: "users.revoke_invitation",
    description: "Revoke a pending invitation.",
    inputSchema: revokeInvitationSchema,
    requiredPageKey: "manage-system-users",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      await revokeWorkspaceInvitation(ctx.db, {
        companyId: ctx.companyId,
        invitationId: (input as { invitationId: number }).invitationId,
      });
      return commitResult({ revoked: true });
    },
  },
];
