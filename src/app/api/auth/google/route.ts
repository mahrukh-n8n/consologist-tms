/**
 * Start Google sign-in. Redirects to Google's consent screen.
 * State and returnTo are stored in short-lived http-only cookies.
 */
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { appOrigin, appUrl } from "@/lib/http/app-origin";

export const dynamic = "force-dynamic";

function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(appUrl("/login?error=google_config"));
  }

  const requestUrl = new URL(request.url);
  const returnTo = safeReturnTo(requestUrl.searchParams.get("returnTo"));
  const state = randomBytes(24).toString("hex");

  const store = await cookies();
  store.set("google_oauth_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  store.set("google_oauth_return_to", returnTo, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });

  const redirectUri =
    process.env.GOOGLE_LOGIN_REDIRECT_URI ?? `${appOrigin(requestUrl.origin)}/api/auth/google/callback`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  return NextResponse.redirect(authUrl);
}
