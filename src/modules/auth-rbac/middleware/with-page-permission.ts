import { requirePageAccess, requirePageWrite } from "./page-access";
import { requireCompany } from "@/lib/company/require-company";

/**
 * Higher-order wrapper that enforces page-level permissions on a server action.
 *
 * "read" level: requires READ_ONLY or READ_WRITE (blocks NONE → 403)
 * "write" level: requires READ_WRITE only (blocks NONE and READ_ONLY)
 *
 * The wrapper fetches the authenticated user context via requireCompany().
 * If requireCompany() is cached within the request (via React cache()), the
 * wrapped action calling it again is a no-op extra round trip.
 *
 * PermissionError is NOT caught here — it propagates to the caller so form
 * submission handlers can surface the error in UI. Fail loud, fail early.
 *
 * No "use server" directive here — the directive stays in the file that
 * defines the actual server action.
 *
 * Usage:
 * ```ts
 * export const createJournalEntry = withPagePermission("journal", "write",
 *   async (formData: FormData) => {
 *     // ... mutation logic
 *   }
 * );
 * ```
 */
export function withPagePermission<TArgs extends unknown[], TReturn>(
  pageKey: string,
  level: "read" | "write",
  action: (...args: TArgs) => Promise<TReturn>
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    const { user, company } = await requireCompany();

    if (level === "write") {
      await requirePageWrite(user.id, company.id, pageKey);
    } else {
      await requirePageAccess(user.id, company.id, pageKey);
    }

    return action(...args);
  };
}
