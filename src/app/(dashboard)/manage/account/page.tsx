import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { McpKeyForm } from "./key-form";
import { revokeMcpKeyAction, setMcpWritesAction, updateAlertPrefsAction } from "./actions";
import { getAlertPreferences } from "@/lib/account/alert-preferences";

export default async function AccountPage() {
  const { user, company } = await requireCompany();
  const alertPrefs = await getAlertPreferences(prisma, user.id, company.id);
  const keys = await prisma.mcpApiKey.findMany({
    where: { userId: user.id, companyId: company.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="section-gap">
      <div>
        <h1 className="page-title">My Account</h1>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Name and workspace membership.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p><span className="text-muted-foreground">Name:</span> {user.fullName}</p>
          <p><span className="text-muted-foreground">Workspace:</span> {company.name}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email alerts</CardTitle>
          <CardDescription>
            Sent only for tasks assigned to you: due soon, overdue, comments, and mentions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateAlertPrefsAction} className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="dueSoon" defaultChecked={alertPrefs.dueSoon} />
              Due soon (within 24 hours)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="overdue" defaultChecked={alertPrefs.overdue} />
              Overdue
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="comment" defaultChecked={alertPrefs.comment} />
              New comment on an assigned task
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="mention" defaultChecked={alertPrefs.mention} />
              Tagged/mentioned in a comment
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="digest" defaultChecked={alertPrefs.digest} />
              Daily diary (one email a day: overdue, due soon, assigned)
            </label>
            <Button type="submit" variant="outline" size="sm">Save alert preferences</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>MCP access</CardTitle>
          <CardDescription>
            API keys authenticate the MCP server over Streamable HTTP (<code>/api/mcp</code>) or stdio. Writes are off by default.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={setMcpWritesAction} className="flex items-center gap-3">
            <input type="hidden" name="enabled" value={user.mcpWritesEnabled ? "false" : "true"} />
            <span className="text-sm">MCP writes: <strong>{user.mcpWritesEnabled ? "enabled" : "disabled"}</strong></span>
            <Button type="submit" variant="outline" size="sm">
              {user.mcpWritesEnabled ? "Disable writes" : "Enable writes"}
            </Button>
          </form>

          <McpKeyForm appUrl={process.env.APP_URL ?? ""} companyId={company.id} />

          {keys.length > 0 ? (
            <div className="space-y-2">
              {keys.map((key) => (
                <div key={key.id} className="flex items-center justify-between rounded-xl border-2 border-ink bg-card p-2 shadow-[2px_2px_0_var(--ink)] text-sm">
                  <span>
                    {key.label ?? "Unlabeled"} · …{key.keyPrefix} ·{" "}
                    {key.revokedAt ? "revoked" : "active"}
                  </span>
                  {key.revokedAt ? null : (
                    <form action={revokeMcpKeyAction}>
                      <input type="hidden" name="id" value={key.id} />
                      <Button type="submit" variant="ghost" size="sm">Revoke</Button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No API keys yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
