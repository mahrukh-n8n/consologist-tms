import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Public routes — middleware does NOT redirect these even if unauthenticated
const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/accept-invite",
  "/auth/",
  "/api/auth/",
  "/htmldocs/",
  "/_next/",
  "/favicon",
  "/manifest",
  "/icons/",
  "/sw.js",
  "/api/",
];

// Routes that pass through without auth — authenticated users may need these
// before they have a company assignment (e.g. /awaiting-permissions, /companies/new).
const PASSTHROUGH_PREFIXES = [
  "/awaiting-permissions",
  "/companies",
  "/welcome",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes immediately — no JWT check
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Passthrough routes — no auth enforcement, but set x-pathname
  if (PASSTHROUGH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const response = NextResponse.next();
    response.headers.set("x-pathname", pathname);
    return response;
  }

  // Everything else is protected — redirect to /login if no valid session
  const response = NextResponse.next();
  response.headers.set("x-pathname", pathname);

  // JWT check — no DB call in middleware
  // DB-backed session revocation is checked by requireAuth() in server components
  const sessionCookie = request.cookies.get("auth-session");
  if (!sessionCookie?.value) {
    return redirectToLogin(request);
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    await jwtVerify(sessionCookie.value, secret);
    return response;
  } catch {
    // Token invalid or expired — clear it and redirect
    const loginResponse = redirectToLogin(request);
    loginResponse.cookies.delete("auth-session");
    return loginResponse;
  }
}

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  const returnTo = request.nextUrl.pathname === "/" ? "/dashboard" : request.nextUrl.pathname;
  loginUrl.searchParams.set("returnTo", returnTo);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Restore authenticates in its route handler. Exclude it here so Next does
  // not clone and buffer the encrypted upload before our streaming parser.
  matcher: ["/((?!api/backup-restore(?:/|$)|_next/static|_next/image|favicon.ico).*)"],
};
