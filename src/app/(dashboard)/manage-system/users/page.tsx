import { requireCompany } from "@/lib/company/require-company";
import { listWorkspaceInvitations, listWorkspaceUsers } from "@/lib/users/membership";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InviteForm } from "./invite-form";
import { revokeInvitationAction } from "./actions";

export default async function UsersPage() {
  const { company } = await requireCompany();
  const [members, invitations] = await Promise.all([
    listWorkspaceUsers(prisma, company.id),
    listWorkspaceInvitations(prisma, company.id),
  ]);

  return (
    <div className="section-gap">
      <div>
        <h1 className="page-title">Users</h1>
        <p className="text-sm text-muted-foreground">Invite people and review workspace members.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invite a user</CardTitle>
          <CardDescription>The invitation email contains a one-time accept link.</CardDescription>
        </CardHeader>
        <CardContent><InviteForm /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Members ({members.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {members.map((member) => (
            <div key={member.id} className="flex items-center justify-between rounded-xl border-2 border-ink bg-card p-2 shadow-[2px_2px_0_var(--ink)]">
              <span>{member.user.fullName} · {member.user.email}</span>
              <span className="text-muted-foreground">{member.role}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pending invitations ({invitations.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {invitations.length === 0 ? (
            <p className="text-muted-foreground">No pending invitations.</p>
          ) : invitations.map((invitation) => (
            <div key={invitation.id} className="flex items-center justify-between rounded-xl border-2 border-ink bg-card p-2 shadow-[2px_2px_0_var(--ink)]">
              <span>{invitation.email} · {invitation.role}</span>
              <form action={revokeInvitationAction}>
                <input type="hidden" name="id" value={invitation.id} />
                <Button type="submit" variant="ghost" size="sm">Revoke</Button>
              </form>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
