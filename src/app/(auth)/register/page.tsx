import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerAction } from "./actions";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-3xl">Create account</CardTitle>
        <CardDescription>Creates your user and first workspace.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={registerAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" name="fullName" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workspace">Workspace name</Label>
            <Input id="workspace" name="workspace" placeholder="My Workspace" required />
          </div>
          {params.error ? <p className="text-sm text-destructive">Could not create the account.</p> : null}
          <Button type="submit" className="w-full">Create account</Button>
        </form>
        <p className="mt-4 text-sm text-muted-foreground">
          Already registered? <Link className="text-primary underline" href="/login">Sign in</Link>
        </p>
      </CardContent>
    </Card>
  );
}
