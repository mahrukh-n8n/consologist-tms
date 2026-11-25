import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-3xl">Sign in</CardTitle>
        <CardDescription>Use your Consologist TMS account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={loginAction} className="space-y-4">
          <input type="hidden" name="returnTo" value={params.returnTo ?? "/dashboard"} />
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {params.error === "rate" ? (
            <p className="text-sm text-destructive">Too many attempts. Try again in 15 minutes.</p>
          ) : params.error ? (
            <p className="text-sm text-destructive">Invalid email or password.</p>
          ) : null}
          <Button type="submit" className="w-full">Sign in</Button>
        </form>
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <Link className="text-primary underline" href="/forgot-password">Forgot password?</Link>
          <span>No account? <Link className="text-primary underline" href="/register">Create one</Link></span>
        </div>
      </CardContent>
    </Card>
  );
}
