import { requireAuth } from "@/lib/auth/require-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWorkspaceAction } from "./actions";

export default async function NewCompanyPage() {
  await requireAuth();
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create a workspace</CardTitle>
          <CardDescription>You are not a member of a workspace yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createWorkspaceAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Workspace name</Label>
              <Input id="name" name="name" required />
            </div>
            <Button type="submit" className="w-full">Create workspace</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
