import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { listCustomStatuses } from "@/lib/tasks/custom-statuses";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusForm } from "./status-form";
import { archiveStatusAction } from "./actions";

export default async function CustomStatusesPage() {
  const { company } = await requireCompany();
  const statuses = await listCustomStatuses(prisma, company.id);

  return (
    <div className="section-gap">
      <div>
        <h1 className="page-title">Custom statuses</h1>
        <p className="text-sm text-muted-foreground">Create workspace statuses for tasks.</p>
      </div>
      <>
          <Card>
            <CardHeader><CardTitle>New status</CardTitle></CardHeader>
            <CardContent><StatusForm /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Statuses ({statuses.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {statuses.length === 0 ? <p className="text-muted-foreground">No custom statuses.</p> : statuses.map((status) => (
                <div key={status.id} className="flex items-center justify-between rounded-xl border-2 border-ink bg-card p-2 shadow-[2px_2px_0_var(--ink)]">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-full" style={{ background: status.color }} />
                    {status.name}
                  </span>
                  <form action={archiveStatusAction}>
                    <input type="hidden" name="id" value={status.id} />
                    <Button type="submit" variant="ghost" size="sm">Archive</Button>
                  </form>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
    </div>
  );
}
