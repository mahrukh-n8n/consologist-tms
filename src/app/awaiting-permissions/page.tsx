import Link from "next/link";
import { requireAuth } from "@/lib/auth/require-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AwaitingPermissionsPage() {
  await requireAuth();
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Awaiting permissions</CardTitle>
          <CardDescription>
            Your workspace membership exists, but no permission template has been assigned yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Ask a workspace administrator to assign your permission template.</p>
          <Button asChild variant="outline"><Link href="/login">Back to sign in</Link></Button>
        </CardContent>
      </Card>
    </main>
  );
}
