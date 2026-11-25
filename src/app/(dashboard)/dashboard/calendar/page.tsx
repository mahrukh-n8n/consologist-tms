import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { listEvents } from "@/lib/calendar/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EventCreateForm } from "./event-form";


export default async function CalendarPage() {
  const { company } = await requireCompany();
  const [projects, events] = await Promise.all([
    prisma.project.findMany({ where: { group: { companyId: company.id }, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    listEvents(prisma, company.id),
  ]);
  return (
    <div className="section-gap">
      <h1 className="page-title">Calendar</h1>
      <Card><CardHeader><CardTitle>New event</CardTitle></CardHeader><CardContent>
        {projects.length === 0 ? <p className="text-sm text-muted-foreground">Create a project first.</p> : (
          <EventCreateForm projects={projects} />
        )}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Upcoming ({events.length})</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
        {events.length === 0 ? <p className="text-muted-foreground">No events.</p> : events.map((e) => (
          <div key={e.id} className="flex items-center justify-between rounded-xl border-2 border-ink bg-card p-2 shadow-[2px_2px_0_var(--ink)]">
            <span><strong>{e.title}</strong> · {e.project.name}</span>
            <span className="text-xs text-muted-foreground">{e.startAt.toISOString().slice(0,16).replace("T"," ")}</span>
          </div>
        ))}
      </CardContent></Card>
    </div>
  );
}
