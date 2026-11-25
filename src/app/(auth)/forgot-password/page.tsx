import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction } from "./actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const params = await searchParams;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-3xl">Forgot password</CardTitle>
        <CardDescription>We will email a reset link if the account exists.</CardDescription>
      </CardHeader>
      <CardContent>
        {params.sent ? (
          <p className="mb-4 text-sm text-muted-foreground">
            If that email is registered, a reset link is on its way.
          </p>
        ) : (
          <form action={forgotPasswordAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <Button type="submit" className="w-full">Send reset link</Button>
          </form>
        )}
        <p className="mt-4 text-sm text-muted-foreground">
          <Link className="text-primary underline" href="/login">Back to sign in</Link>
        </p>
      </CardContent>
    </Card>
  );
}
