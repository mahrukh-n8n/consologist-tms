import Link from "next/link";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { listGroups } from "@/lib/projects/service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ADMIN_LINKS = [
  { label: "Users", href: "/manage-system/users", description: "Members, roles and invitations." },
  { label: "Permissions", href: "/manage-system/permissions", description: "Templates, page access and approval routing." },
  { label: "Approvals", href: "/manage-system/approvals", description: "Review pending maker requests." },
  { label: "Audit", href: "/manage-system/audit", description: "Write, permission and deletion history." },
  { label: "Google Drive", href: "/manage-system/drive", description: "Connect the workspace file store." },
  { label: "Tags", href: "/manage-system/tags", description: "Workspace-wide tag catalogue." },
  { label: "Custom Statuses", href: "/manage-system/statuses", description: "Extra task statuses per workspace." },
  { label: "Backups", href: "/manage-system/backups", description: "Encrypted backup and restore." },
];

export default async function ManageSystemPage() {
  const { company } = await requireCompany();
  const [groups, members, pending] = await Promise.all([
    listGroups(prisma, company.id),
    prisma.userCompanyRole.count({ where: { companyId: company.id } }),
    prisma.pendingApproval.count({ where: { companyId: company.id, status: "PENDING" } }),
  ]);
  const projects = groups.reduce((sum, group) => sum + group.projects.length, 0);
  return (
    <div className="section-gap">
      <div>
        <h1 className="page-title">Manage System</h1>
        <p className="text-sm text-muted-foreground">{company.name}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        {[["Groups", groups.length], ["Projects", projects], ["Members", members], ["Pending approvals", pending]].map(([label, value]) => (
          <Card key={String(label)}><CardHeader><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold">{value}</p></CardContent></Card>
        ))}
      </div>
      <Card><CardHeader><CardTitle>Admin</CardTitle><CardDescription>Everything that used to sit in the sidebar.</CardDescription></CardHeader><CardContent className="grid gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-4">
        {ADMIN_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="rounded-xl border-2 border-ink bg-card p-3 shadow-[3px_3px_0_var(--ink)] transition hover:-translate-y-0.5">
            <p className="font-heading text-sm font-extrabold uppercase">{link.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{link.description}</p>
          </Link>
        ))}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Workspace</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-3 text-sm text-primary">
        <Link href="/projects">Groups &amp; projects</Link>
        <Link href="/files">Files</Link>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Groups</CardTitle><CardDescription>Projects per group.</CardDescription></CardHeader><CardContent className="space-y-2 text-sm">
        {groups.length === 0 ? <p className="text-muted-foreground">No groups.</p> : groups.map((group) => (
          <div key={group.id} className="flex items-center justify-between rounded-xl border-2 border-ink bg-card p-2 shadow-[2px_2px_0_var(--ink)]">
            <span className="font-medium">{group.name}</span>
            <span className="text-muted-foreground">{group.projects.length} projects</span>
          </div>
        ))}
      </CardContent></Card>
    </div>
  );
}
