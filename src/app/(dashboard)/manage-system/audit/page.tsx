import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TABS = [
  ["audit", "Write audit"],
  ["permissions", "Permission audit"],
  ["alerts", "Email alerts"],
] as const;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { company } = await requireCompany();
  const tab = (await searchParams).tab ?? "audit";

  const [audit, permissions, alerts] = await Promise.all([
    prisma.auditLog.findMany({ where: { companyId: company.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.permissionAuditLog.findMany({ where: { companyId: company.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.emailAlert.findMany({ where: { companyId: company.id }, orderBy: { sentAt: "desc" }, take: 100 }),
  ]);

  return (
    <div className="section-gap">
      <div>
        <h1 className="page-title">Audit</h1>
        <p className="text-sm text-muted-foreground">Immutable write, permission and alert evidence.</p>
      </div>

      <div className="flex gap-2 text-sm">
        {TABS.map(([key, label]) => (
          <a
            key={key}
            href={`/manage-system/audit?tab=${key}`}
            className={`rounded-xl border-2 border-ink px-3 py-1.5 ${tab === key ? "bg-accent font-medium" : ""}`}
          >
            {label}
          </a>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>{TABS.find(([key]) => key === tab)?.[1] ?? "Audit"}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {tab === "audit" ? (
            <Table
              head={["When", "Actor", "Table", "Record", "Action"]}
              rows={audit.map((row) => [
                row.createdAt.toISOString().slice(0, 16).replace("T", " "),
                String(row.userId),
                row.tableName,
                String(row.recordId),
                row.action,
              ])}
            />
          ) : tab === "permissions" ? (
            <Table
              head={["When", "Actor", "Target", "Action"]}
              rows={permissions.map((row) => [
                row.createdAt.toISOString().slice(0, 16).replace("T", " "),
                String(row.actorId),
                row.targetUserId ? String(row.targetUserId) : "—",
                row.actionType,
              ])}
            />
          ) : (
            <Table
              head={["When", "User", "Kind", "Status", "Attempts", "Error"]}
              rows={alerts.map((row) => [
                row.sentAt.toISOString().slice(0, 16).replace("T", " "),
                String(row.userId),
                row.kind,
                row.status,
                String(row.attempts),
                row.lastError ?? "—",
              ])}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No records.</p>;
  return (
    <table className="w-full min-w-[640px] text-sm">
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          {head.map((h) => <th key={h} className="py-2 pr-4">{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index} className="border-b last:border-0">
            {row.map((cell, i) => <td key={i} className="py-2 pr-4">{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
