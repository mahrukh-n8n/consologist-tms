import { redirect } from "next/navigation";
import {
  getAuthenticatedUser,
  AuthError,
  type AuthenticatedUser,
} from "./get-session";

/**
 * Require authentication for a Server Component or Server Action.
 * Redirects to /login if the user is not authenticated.
 *
 * @returns The authenticated user (local DB record)
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
  try {
    const result = await getAuthenticatedUser();
    if (!result) {
      redirect("/login");
    }
    return result;
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login");
    }
    throw error;
  }
}
