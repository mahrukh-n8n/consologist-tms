import { requireCompany } from "@/lib/company/require-company";
import { getPaginatedNotifications } from "@/lib/notifications/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotifyForm } from "@/components/ui/notify-form";
import { markAllReadAction } from "./actions";

export default async function NotificationsPage() {
  const { user, company } = await requireCompany();
  const result = await getPaginatedNotifications(user.id, company.id, { page: 1, limit: 100 });
  return (
    <div className="section-gap">
      <h1 className="page-title">Notifications</h1>
      <NotifyForm action={markAllReadAction} actionId="mark-all-read" submitLabel="Mark all read" successTitle="Notifications cleared" errorTitle="Could not mark read" fields={[]} />
      <Card><CardHeader><CardTitle>Items ({result.notifications.length})</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
        {result.notifications.length === 0 ? <p className="text-muted-foreground">Nothing yet.</p> : result.notifications.map((n) => (
          <div key={n.id} className={`rounded-xl border-2 border-ink bg-card p-2 shadow-[2px_2px_0_var(--ink)] ${n.isRead ? "opacity-60" : ""}`}>
            <p className="font-medium">{n.title}</p>
            <p className="text-muted-foreground">{n.message}</p>
            <p className="text-xs text-muted-foreground">{n.createdAt.slice(0,16).replace("T"," ")}</p>
          </div>
        ))}
      </CardContent></Card>
    </div>
  );
}
