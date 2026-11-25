import Link from "next/link";
import { ArrowRight, CalendarClock, CheckSquare, FolderOpen, Flame } from "lucide-react";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { canSeeAllProjects, projectVisibilityWhere } from "@/lib/projects/access";

const ACCENTS = ["accent-lime", "accent-cyan", "accent-pink", "accent-orange"];
const QUICK_ACTIONS = [
  { label: "Tasks", href: "/tasks", accent: "accent-lime" },
  { label: "Projects", href: "/projects", accent: "accent-cyan" },
  { label: "Documents", href: "/documents", accent: "accent-pink" },
  { label: "Notifications", href: "/notifications", accent: "accent-orange" },
];

export default async function DashboardPage() {
  const { user, company } = await requireCompany();
  const now = new Date();
  const seeAll = await canSeeAllProjects(prisma, user.id, company.id);
  const scope = projectVisibilityWhere(company.id, user.id, seeAll);
  const [projects, tasks, inProgress, overdue, upcoming] = await Promise.all([
    prisma.project.count({ where: { ...scope, archivedAt: null } }),
    prisma.task.count({ where: { project: scope } }),
    prisma.task.count({ where: { project: scope, status: "IN_PROGRESS" } }),
    prisma.task.count({ where: { project: scope, status: { not: "COMPLETED" }, dueAt: { lt: now } } }),
    prisma.task.findMany({
      where: { project: scope, status: { not: "COMPLETED" } },
      include: { assignees: { include: { user: { select: { fullName: true } } } }, tags: { include: { tag: true } } },
      orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
      take: 5,
    }),
  ]);

  const stats = [
    { label: "Projects", value: projects, icon: FolderOpen, href: "/projects" },
    { label: "Tasks", value: tasks, icon: CheckSquare, href: "/tasks" },
    { label: "In progress", value: inProgress, icon: Flame, href: "/tasks" },
    { label: "Overdue", value: overdue, icon: CalendarClock, href: "/tasks" },
  ];

  return (
    <div className="section-gap">
      <section className="block-card relative overflow-hidden p-6 sm:p-8">
        <div className="absolute -right-8 -top-8 size-40 rounded-full border-2 border-ink bg-lime opacity-70" aria-hidden />
        <div className="absolute -bottom-10 right-24 size-24 rotate-12 border-2 border-ink bg-pink opacity-60" aria-hidden />
        <div className="relative max-w-2xl">
          <p className="eyebrow text-primary">Home</p>
          <h1 className="page-title mt-2">Hey {user.fullName ?? "there"}.</h1>
          <p className="page-subtitle mt-3">Here is what is moving across {company.name} right now.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/tasks" className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-ink bg-accent px-4 font-extrabold uppercase shadow-[4px_4px_0_var(--ink)] transition hover:-translate-y-0.5">
              Create a task <ArrowRight className="size-4" />
            </Link>
            <Link href="/projects" className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-ink bg-card px-4 font-extrabold uppercase shadow-[4px_4px_0_var(--ink)] transition hover:-translate-y-0.5">
              Browse projects
            </Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {stats.map((stat, index) => (
          <Link key={stat.label} href={stat.href} className="stat-block block-lift">
            <div className={`stat-accent ${ACCENTS[index % ACCENTS.length]}`} />
            <div className="flex items-start justify-between p-5">
              <div>
                <p className="eyebrow text-muted-foreground">{stat.label}</p>
                <p className="font-heading text-5xl font-black leading-none">{stat.value}</p>
              </div>
              <span className="flex size-10 items-center justify-center rounded-xl border-2 border-ink bg-card">
                <stat.icon className="size-5" />
              </span>
            </div>
          </Link>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Up next</CardTitle>
            <Link href="/tasks" className="text-xs font-extrabold uppercase underline">All tasks</Link>
          </CardHeader>
          <CardContent className="space-y-2 pt-4">
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open tasks. Create one to get moving.</p>
            ) : upcoming.map((task) => (
              <Link key={task.id} href={`/tasks/${task.id}`} className="flex items-center justify-between gap-3 rounded-xl border-2 border-ink bg-card px-3 py-2 shadow-[2px_2px_0_var(--ink)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--ink)]">
                <div className="min-w-0">
                  <p className="truncate font-bold">{task.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {task.assignees.map((a) => a.user.fullName).join(", ") || "Unassigned"} · {task.dueAt ? `due ${task.dueAt.toISOString().slice(0, 10)}` : "no due date"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {task.tags.slice(0, 2).map(({ tag }) => <span key={tag.id} className="chip chip-cyan">{tag.title}</span>)}
                  <span className="chip chip-purple">{task.status.replaceAll("_", " ")}</span>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Quick actions</CardTitle></CardHeader>
          <CardContent className="grid gap-2 pt-4 sm:grid-cols-2">
            {QUICK_ACTIONS.map((action) => (
              <Link key={action.label} href={action.href} className="rounded-xl border-2 border-ink bg-card p-3 font-extrabold uppercase shadow-[3px_3px_0_var(--ink)] transition hover:-translate-y-0.5">
                <span className={`mb-2 block h-2 w-8 rounded-full border-2 border-ink ${action.accent}`} />
                {action.label}
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
