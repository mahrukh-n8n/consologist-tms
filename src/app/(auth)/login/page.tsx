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
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const googleError =
    params.error === "google_config" ? "Google sign-in is not configured."
    : params.error === "google_state" ? "Google sign-in expired. Try again."
    : params.error === "google" ? "Google sign-in failed. Try again."
    : null;
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
          {googleError ? <p className="text-sm text-destructive">{googleError}</p> : null}
          {params.error === "rate" ? (
            <p className="text-sm text-destructive">Too many attempts. Try again in 15 minutes.</p>
          ) : params.error ? (
            <p className="text-sm text-destructive">Invalid email or password.</p>
          ) : null}
          <Button type="submit" className="w-full">Sign in</Button>
        </form>
        {googleEnabled ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
            </div>
            <a
              href={`/api/auth/google?returnTo=${encodeURIComponent(params.returnTo ?? "/dashboard")}`}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-ink bg-card px-3 text-sm font-extrabold uppercase shadow-[3px_3px_0_var(--ink)] transition hover:-translate-y-0.5"
            >
              Continue with Google
            </a>
          </div>
        ) : null}
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <Link className="text-primary underline" href="/forgot-password">Forgot password?</Link>
          <span>No account? <Link className="text-primary underline" href="/register">Create one</Link></span>
        </div>
      </CardContent>
    </Card>
  );
}
