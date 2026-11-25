import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Row = { id: number; title: string };

function Section({ label, rows }: { label: string; rows: Row[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm text-muted-foreground">{label} ({rows.length})</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-sm">
        {rows.length === 0 ? <p className="text-muted-foreground">None.</p> : rows.map((row) => <p key={row.id}>{row.title}</p>)}
      </CardContent>
    </Card>
  );
}

export default async function DailyRecapPage() {
  const { company } = await requireCompany();
  const start = new Date(); start.setHours(0,0,0,0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const base = { project: { group: { companyId: company.id } } };
  const [completed, updated, due] = await Promise.all([
    prisma.task.findMany({ where: { ...base, completedAt: { gte: start, lt: end } }, select: { id: true, title: true }, take: 50 }),
    prisma.task.findMany({ where: { ...base, updatedAt: { gte: start, lt: end } }, select: { id: true, title: true }, take: 50 }),
    prisma.task.findMany({ where: { ...base, dueAt: { gte: start, lt: end } }, select: { id: true, title: true }, take: 50 }),
  ]);
  return (
    <div className="section-gap">
      <h1 className="page-title">Daily recap</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <Section label="Completed today" rows={completed} />
        <Section label="Updated today" rows={updated} />
        <Section label="Due today" rows={due} />
      </div>
    </div>
  );
}
