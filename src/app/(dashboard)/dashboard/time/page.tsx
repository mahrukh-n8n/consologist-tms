import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { listTimeRecords } from "@/lib/time/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TimeCreateForm } from "./time-form";


export default async function TimePage() {
  const { user, company } = await requireCompany();
  const [projects, records] = await Promise.all([
    prisma.project.findMany({ where: { group: { companyId: company.id }, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    listTimeRecords(prisma, company.id, user.id),
  ]);
  const total = records.reduce((sum, r) => sum + r.minutes, 0);
  return (
    <div className="section-gap">
      <h1 className="page-title">Time</h1>
      <Card><CardHeader><CardTitle>Log time</CardTitle></CardHeader><CardContent>
        {projects.length === 0 ? <p className="text-sm text-muted-foreground">Create a project first.</p> : (
          <TimeCreateForm projects={projects} />
        )}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Total {Math.floor(total/60)}h {total%60}m ({records.length} records)</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
        {records.length === 0 ? <p className="text-muted-foreground">No time records.</p> : records.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-xl border-2 border-ink bg-card p-2 shadow-[2px_2px_0_var(--ink)]">
            <span>{r.description || "Time entry"} · {r.project.name}</span>
            <span className="text-xs text-muted-foreground">{r.date.toISOString().slice(0,10)} · {r.minutes}m</span>
          </div>
        ))}
      </CardContent></Card>
    </div>
  );
}
