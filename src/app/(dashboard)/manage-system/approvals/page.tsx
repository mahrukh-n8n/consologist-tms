import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApprovalButtons } from "./approval-buttons";

export default async function ApprovalsPage() {
  const { company } = await requireCompany();
  const rows = await prisma.pendingApproval.findMany({
    where: { companyId: company.id },
    orderBy: { submittedAt: "desc" },
    take: 100,
  });

  return (
    <div className="section-gap">
      <div>
        <h1 className="page-title">Approval queue</h1>
        <p className="text-sm text-muted-foreground">
          Pending requests have no real entity until approved; approval runs the same gatekeeper.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Requests ({rows.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No approval requests.</p>
          ) : rows.map((row) => (
            <div key={row.id} className="rounded-xl border-2 border-ink bg-card p-3 shadow-[3px_3px_0_var(--ink)] text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{row.entityType} · page {row.pageKey}</p>
                  <p className="text-xs text-muted-foreground">
                    Submitted {row.submittedAt.toISOString().slice(0, 16).replace("T", " ")} · status {row.status}
                  </p>
                </div>
                {row.status === "PENDING" ? <ApprovalButtons id={row.id} /> : null}
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-primary">Payload</summary>
                <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">{JSON.stringify(row.payload, null, 2)}</pre>
              </details>
              {row.rejectionReason ? <p className="mt-2 text-xs text-destructive">Rejected: {row.rejectionReason}</p> : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
