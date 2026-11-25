import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordAction } from "./actions";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const params = await searchParams;
  const token = params.token ?? "";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-3xl">Choose a new password</CardTitle>
        <CardDescription>This link can only be used once.</CardDescription>
      </CardHeader>
      <CardContent>
        {token ? (
          <form action={resetPasswordAction} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required />
            </div>
            {params.error ? <p className="text-sm text-destructive">{params.error}</p> : null}
            <Button type="submit" className="w-full">Update password</Button>
          </form>
        ) : (
          <p className="text-sm text-destructive">This reset link is invalid.</p>
        )}
        <p className="mt-4 text-sm text-muted-foreground">
          <Link className="text-primary underline" href="/login">Back to sign in</Link>
        </p>
      </CardContent>
    </Card>
  );
}
