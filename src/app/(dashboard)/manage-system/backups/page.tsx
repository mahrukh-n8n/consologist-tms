import { Fragment } from "react";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BackupForm } from "./backup-form";
import { deleteBackupAction, pauseScheduleAction, saveScheduleAction } from "./actions";
import { listWorkspaceBackups } from "@/lib/backup/backup-service";
import { getSchedule } from "@/lib/backup/schedule";
import { NotifyForm } from "@/components/ui/notify-form";
import { RestoreForm } from "./restore-form";

export default async function BackupsPage() {
  const { company } = await requireCompany();
  const backupPage = await listWorkspaceBackups(prisma, company.id, { page: 1, limit: 25 });
  const backups = backupPage.items;
  const schedule = await getSchedule(prisma, company.id);

  return (
    <div className="section-gap">
      <div>
        <h1 className="page-title">Backups</h1>
        <p className="text-sm text-muted-foreground">
          Encrypted workspace backups stored in the database and on the local filesystem.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Automatic backups</CardTitle>
          <CardDescription>
            {schedule?.isActive
              ? `Every ${schedule.intervalHours}h, keep ${schedule.retentionCount}. Next: ${schedule.nextRunAt?.toISOString().slice(0,16).replace("T"," ") ?? "—"}`
              : "No active schedule."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <NotifyForm
            action={saveScheduleAction}
            actionId="backup-schedule"
            submitLabel="Save schedule"
            successTitle="Schedule saved"
            errorTitle="Schedule not saved"
            fields={[
              { kind: "number", name: "intervalHours", label: "Interval (hours)", required: true, defaultValue: String(schedule?.intervalHours ?? 24) },
              { kind: "number", name: "retentionCount", label: "Keep", required: true, defaultValue: String(schedule?.retentionCount ?? 7) },
              { kind: "select", name: "storages", label: "Destinations", required: true, defaultValue: schedule?.storageLocations ?? "db,filesystem", options: [
                { value: "db", label: "Database" },
                { value: "db,filesystem", label: "Database + filesystem" },
                { value: "db,filesystem,drive", label: "Database + filesystem + Drive" },
              ] },
            ]}
          />
          {schedule?.isActive ? (
            <form action={pauseScheduleAction}><Button type="submit" variant="outline" size="sm">Pause schedule</Button></form>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create backup</CardTitle>
          <CardDescription>The password encrypts the file; store it safely.</CardDescription>
        </CardHeader>
        <CardContent><BackupForm /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Existing backups ({backupPage.total})</CardTitle></CardHeader>
        <CardContent>
          {backups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No backups yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">File</th>
                    <th className="py-2 pr-4">Sources</th>
                    <th className="py-2 pr-4">Storage</th>
                    <th className="py-2 pr-4">Created</th>
                    <th className="py-2 pr-4" />
                  </tr>
                </thead>
                <tbody>
                  {backups.map((backup) => (
                    <Fragment key={backup.id}>
                    <tr className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{backup.fileName}</td>
                      <td className="py-2 pr-4">{backup.sourceCount}</td>
                      <td className="py-2 pr-4">{backup.storageLocations.join(", ")}</td>
                      <td className="py-2 pr-4">{backup.createdAt.toISOString().slice(0, 19).replace("T", " ")}</td>
                      <td className="py-2 pr-4 text-right">
                        <form action={deleteBackupAction}>
                          <input type="hidden" name="id" value={backup.id} />
                          <Button type="submit" variant="ghost" size="sm">Delete</Button>
                        </form>
                      </td>
                    </tr>
                    <tr className="border-b last:border-0">
                      <td colSpan={5} className="pb-3">
                        <details>
                          <summary className="cursor-pointer text-sm text-primary">Restore options</summary>
                          <div className="mt-2">
                            <RestoreForm backupId={backup.id} />
                          </div>
                        </details>
                      </td>
                    </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Page {backupPage.page} of {backupPage.totalPages}</p>
        </CardContent>
      </Card>
    </div>
  );
}
