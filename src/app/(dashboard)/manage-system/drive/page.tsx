import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { getConnection, isConnected } from "@/modules/google-drive";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { disconnectDriveAction } from "./actions";

export default async function DrivePage() {
  const { company } = await requireCompany();
  const [connection, connected] = await Promise.all([
    getConnection(prisma, company.id),
    isConnected(prisma, company.id),
  ]);
  const envReady = Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET && process.env.GOOGLE_DRIVE_ENCRYPTION_KEY);

  return (
    <div className="section-gap">
      <div>
        <h1 className="page-title">Google Drive</h1>
        <p className="text-sm text-muted-foreground">Files and backup copies are stored in this workspace&apos;s Drive folder.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Connection</CardTitle><CardDescription>{connected ? "Connected" : connection ? "Configured but disabled" : "Not connected"}</CardDescription></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!envReady ? (
            <p className="text-destructive">Set GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET and GOOGLE_DRIVE_ENCRYPTION_KEY.</p>
          ) : connection ? (
            <p>Folder: <strong>{connection.folderName}</strong> · connected {connection.connectedAt.toISOString().slice(0,10)}</p>
          ) : (
            <p className="text-muted-foreground">No Drive folder is connected.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" disabled={!envReady}>
              <a href="/api/google-drive/connect">{connection ? "Reconnect" : "Connect Google Drive"}</a>
            </Button>
            {connection ? (
              <form action={disconnectDriveAction}>
                <Button type="submit" variant="destructive">Disconnect</Button>
              </form>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
