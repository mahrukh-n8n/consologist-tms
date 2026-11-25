# auth-session Module Rules

## Module Location
`src/modules/auth-session/` — zero imports from app business logic. Extractable by copy.

## Barrel Boundary

Same pattern as auth-rbac: two entry points.

| Entry Point | Safe In | Exports |
|---|---|---|
| `@/modules/auth-session/client` | `"use client"` components | Types, constants (COOKIE_NAME, COOKIE_MAX_AGE) |
| `@/modules/auth-session` (index.ts) | Server components, server actions | Everything above + session services, email services |

**Rule:** Any `"use client"` file must import from `@/modules/auth-session/client` — never the root barrel.

## Email Provider (Resend)

### Env Vars Required
```
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

### Domain Verification is Required for Multi-Recipient
Resend's default test sender (`onboarding@resend.dev`) can **only** send to the account owner's email.
To send to any recipient (invited users, password resets):
1. Verify a domain at resend.com/domains
2. Set `RESEND_FROM_EMAIL` to an address on that domain (e.g. `noreply@yourdomain.com`)
3. Domain verification works regardless of where the app runs (localhost, Docker, production)

**Common trap:** Domain shows "Verified" on Resend dashboard but `.env` still has `onboarding@resend.dev` — emails fail silently or throw "You can only send testing emails to your own email address".

### Email Failure Must Not Block Invitation Creation
The invitation record is the source of truth, not the email delivery. If email send fails:
- Log the error
- Do NOT roll back the invitation
- Admin can share the link manually via "Copy Link" button

```ts
// RIGHT — invitation succeeds even if email fails
try {
  await sendInvitationEmail({ ... });
} catch (emailErr) {
  console.error("Invitation email failed:", emailErr);
}
```

## Invitation Accept Flow — returnTo Chain (CRITICAL)

When an unauthenticated user clicks an invitation link, the flow is:

```
/accept-invite?token=X
  → user not logged in
  → redirect to /login?returnTo=/accept-invite?token=X
  → user logs in
  → redirect to /accept-invite?token=X  (returnTo honored)
  → acceptInvitation() creates UserCompanyRole
  → redirect to /dashboard
```

**Every auth page (login, register, forgot-password) MUST:**
1. Read `returnTo` from URL search params
2. Pass it as a hidden `<input name="returnTo">` in the form
3. Preserve it in cross-links (login ↔ register ↔ forgot-password)
4. The server action must read `returnTo` from formData and redirect there after success

**returnTo validation (open redirect prevention):**
```ts
function safeReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;  // block protocol-relative
  return value;
}
```

**Without this chain:** User logs in → lands on `/dashboard` → invitation never accepted → `UserCompanyRole` never created → user appears in invitations but NOT in users list.

## No-Company Redirect Must Check Pending Invitations First

`getActiveCompany()` in `src/lib/company/get-active-company.ts` resolves the user's active company. If no `UserCompanyRole` exists, it must check for pending invitations before redirecting to `/companies/new`.

```
Resolution order:
1. Cookie activeCompanyId → verify role exists → return company
2. First company the user belongs to → return company
3. Pending invitation exists → redirect to /accept-invite?token=X
4. No companies AND no invitations → redirect to /companies/new
```

**Without step 3:** Invited users who log in (without the returnTo param) land on "Create a New Company" — confusing because they were invited to an existing one. The invitation never gets accepted, and the user never appears in the company's user list.

## Google OAuth Callback Must Also Honor returnTo

If the app supports Google OAuth login, the OAuth callback handler must:
1. Check for a stored `returnTo` (e.g. in session/cookie before redirect to Google)
2. Redirect there after successful authentication
3. Same `safeReturnTo` validation applies

## Password-less Users (Google OAuth Migration)

Users who registered via Google OAuth (or legacy Supabase) may have `passwordHash = null`.
When they try email/password login, the action returns `needsPasswordSetup: true`.

**The user is stuck if:**
- They can't use Google OAuth (client ID invalid/missing)
- They can't reset password (email provider not configured)
- They have no password to log in with

**Admin escape hatch:** Super Admin / Admin can set a password for any invited user directly from the Invitations page → "Set Password" button. This action:
- Validates a pending invitation exists for the email
- Finds the user by email (not by company membership)
- Hashes and saves the password
- Does NOT require the user to be a company member yet

## Google OAuth Client Setup

OAuth credentials are per-GCP-project. This app uses TWO redirect URIs (login + Google Drive):

**Required redirect URIs (both must be registered):**
```
{APP_URL}/auth/callback                  ← Google login
{APP_URL}/admin/google-drive/callback    ← Google Drive integration
```

If reusing the same OAuth client for both, add BOTH URIs. Missing one causes `Error 400: redirect_uri_mismatch`.

**Env vars (can share or separate):**
- Login: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Drive: `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`

Common errors:
- `400 redirect_uri_mismatch` = Redirect URI not registered in GCP OAuth client
- `401 invalid_client` = Client ID doesn't exist or was deleted from Google Cloud Console
- Fix: Go to console.cloud.google.com → Credentials → verify the OAuth 2.0 Client exists and has both redirect URIs

## Porting Checklist (New App Setup)

When porting auth-session to a new app:

1. **Resend:** Create account → create API key → verify domain → set both env vars
2. **Google OAuth:** Create GCP project → create OAuth client → set redirect URI → set both env vars
3. **JWT_SECRET:** Generate with `openssl rand -hex 32`
4. **returnTo chain:** Verify login, register, and forgot-password all propagate `returnTo`
5. **No-company redirect:** `getActiveCompany()` must check pending invitations before redirecting to company creation
6. **Password escape hatch:** Ensure admin can set passwords for users who can't self-serve
7. **Test with a fresh user:** Invite → register → accept → verify they appear in Users list
8. **Test without returnTo:** Log in directly (no returnTo) → should still reach accept-invite via step 5
