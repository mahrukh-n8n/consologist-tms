/**
 * Google sign-in callback.
 *
 * Verifies the state cookie, exchanges the code, reads the verified email and
 * creates the session. A first-time Google user is created without a password;
 * password login for that account is available after "Forgot password".
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { COOKIE_MAX_AGE, COOKIE_NAME, createSession } from "@/modules/auth-session";
import { appOrigin, appUrl } from "@/lib/http/app-origin";

export const dynamic = "force-dynamic";

type GoogleProfile = { email?: string; email_verified?: boolean; name?: string };

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const store = await cookies();
  const expectedState = store.get("google_oauth_state")?.value;
  const returnTo = store.get("google_oauth_return_to")?.value ?? "/dashboard";

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(appUrl("/login?error=google_state", origin));
  }
  store.delete("google_oauth_state");
  store.delete("google_oauth_return_to");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(appUrl("/login?error=google_config", origin));
  }

  const redirectUri =
    process.env.GOOGLE_LOGIN_REDIRECT_URI ?? `${appOrigin(origin)}/api/auth/google/callback`;

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) throw new Error(`Token exchange failed (${tokenResponse.status}).`);
    const tokens = (await tokenResponse.json()) as { access_token?: string };
    if (!tokens.access_token) throw new Error("Google did not return an access token.");

    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileResponse.ok) throw new Error(`Profile fetch failed (${profileResponse.status}).`);
    const profile = (await profileResponse.json()) as GoogleProfile;
    const email = profile.email?.trim().toLowerCase();
    if (!email || profile.email_verified === false) throw new Error("Google account has no verified email.");

    const user =
      (await prisma.user.findUnique({ where: { email } })) ??
      (await prisma.user.create({
        data: { email, fullName: profile.name?.trim() || email },
      }));

    const token = await createSession(prisma, { userId: user.id, email: user.email });
    store.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });

    const safeReturn = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/dashboard";
    return NextResponse.redirect(appUrl(safeReturn, origin));
  } catch (error) {
    console.error("Google sign-in failed:", error);
    return NextResponse.redirect(appUrl("/login?error=google", origin));
  }
}
