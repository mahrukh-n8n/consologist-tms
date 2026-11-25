import Link from "next/link";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ACCENTS = ["accent-lime", "accent-cyan", "accent-pink", "accent-orange"];

export default async function WidgetsPage() {
  const { company } = await requireCompany();
  const now = new Date();
  const [projects, tasks, inProgress, overdue, upcoming] = await Promise.all([
    prisma.project.count({ where: { group: { companyId: company.id }, archivedAt: null } }),
    prisma.task.count({ where: { project: { group: { companyId: company.id } } } }),
    prisma.task.count({ where: { project: { group: { companyId: company.id } }, status: "IN_PROGRESS" } }),
    prisma.task.count({ where: { project: { group: { companyId: company.id } }, status: { not: "COMPLETED" }, dueAt: { lt: now } } }),
    prisma.task.findMany({
      where: { project: { group: { companyId: company.id } }, status: { not: "COMPLETED" }, dueAt: { gte: now } },
      orderBy: { dueAt: "asc" },
      take: 5,
      select: { id: true, title: true, dueAt: true },
    }),
  ]);
  const stats = [["Projects", projects], ["Tasks", tasks], ["In progress", inProgress], ["Overdue", overdue]] as const;
  return (
    <div className="section-gap">
      <header>
        <p className="eyebrow text-primary">Overview</p>
        <h1 className="page-title">Widgets</h1>
        <p className="page-subtitle mt-2">A quick pulse on projects, tasks and what is due next.</p>
      </header>
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map(([label, value], index) => (
          <div key={label} className="stat-block block-lift">
            <div className={`stat-accent ${ACCENTS[index]}`} />
            <div className="p-5">
              <p className="eyebrow text-muted-foreground">{label}</p>
              <p className="font-heading text-5xl font-black leading-none">{value}</p>
            </div>
          </div>
        ))}
      </section>
      <Card>
        <CardHeader><CardTitle>Upcoming</CardTitle></CardHeader>
        <CardContent className="space-y-2 pt-4">
          {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">Nothing upcoming.</p> : upcoming.map((task) => (
            <Link key={task.id} href={`/tasks/${task.id}`} className="flex items-center justify-between gap-2 rounded-xl border-2 border-ink bg-card p-2 shadow-[2px_2px_0_var(--ink)] hover:-translate-y-0.5">
              <span className="font-bold">{task.title}</span>
              <span className="chip chip-cyan">{task.dueAt?.toISOString().slice(0, 10)}</span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
