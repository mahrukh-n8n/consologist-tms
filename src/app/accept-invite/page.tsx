import Link from "next/link";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptInviteAction } from "./actions";

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const params = await searchParams;
  const token = params.token ?? "";
  const invitation = token ? await prisma.invitation.findUnique({ where: { token } }) : null;
  const valid = invitation && !invitation.accepted && invitation.expiresAt > new Date();

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Accept invitation</CardTitle>
          <CardDescription>
            {valid ? `Join as ${invitation.email}.` : "This invitation is invalid or expired."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {valid ? (
            <form action={acceptInviteAction} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input id="fullName" name="fullName" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required />
              </div>
              {params.error ? <p className="text-sm text-destructive">Check your details and try again.</p> : null}
              <Button type="submit" className="w-full">Join workspace</Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ask a workspace admin to send a new invitation.
            </p>
          )}
          <p className="mt-4 text-sm text-muted-foreground">
            <Link className="text-primary underline" href="/login">Back to sign in</Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
