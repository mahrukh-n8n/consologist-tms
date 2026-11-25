import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NotifyForm } from "@/components/ui/notify-form";
import { assignTemplateAction } from "./actions";

export default async function PermissionsPage() {
  const { company } = await requireCompany();
  const [templates, members] = await Promise.all([
    prisma.permissionTemplate.findMany({ where: { companyId: company.id }, include: { pages: true }, orderBy: { name: "asc" } }),
    prisma.userCompanyRole.findMany({
      where: { companyId: company.id },
      include: {
        user: {
          select: {
            id: true, fullName: true, email: true,
            permissionAssignments: { where: { companyId: company.id }, select: { template: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div className="section-gap">
      <div>
        <h1 className="page-title">Permissions</h1>
        <p className="text-sm text-muted-foreground">Templates define page access; assignments bind a member to one template.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Assign template</CardTitle><CardDescription>Users without an assignment are sent to awaiting-permissions.</CardDescription></CardHeader>
        <CardContent>
          {members.length === 0 || templates.length === 0 ? <p className="text-sm text-muted-foreground">Invite users and seed templates first.</p> : (
            <NotifyForm action={assignTemplateAction} actionId="assign-template" submitLabel="Assign" successTitle="Template assigned" errorTitle="Assignment failed"
              fields={[
                { kind: "select", name: "userId", label: "User", required: true, className: "min-w-72 space-y-1", options: members.map((m) => ({ value: String(m.user.id), label: `${m.user.fullName} <${m.user.email}>` })) },
                { kind: "select", name: "templateId", label: "Template", required: true, className: "min-w-64 space-y-1", options: templates.map((t) => ({ value: String(t.id), label: `${t.name} (${t.pages.length} pages)` })) },
              ]} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Templates ({templates.length})</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 text-sm">
          {templates.map((t) => (
            <div key={t.id} className="rounded-xl border-2 border-ink bg-card p-2 shadow-[2px_2px_0_var(--ink)]">
              <p className="font-medium">{t.name}</p>
              <p className="text-xs text-muted-foreground">{t.description ?? "No description"} · {t.pages.length} pages</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Members ({members.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {members.map((m) => {
            const assigned = m.user.permissionAssignments[0]?.template.name;
            return (
              <div key={m.id} className="flex items-center justify-between rounded-xl border-2 border-ink bg-card p-2 shadow-[2px_2px_0_var(--ink)]">
                <span>{m.user.fullName} · {m.user.email}</span>
                <span className={assigned ? "text-muted-foreground" : "text-destructive"}>{assigned ?? "No template"}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
