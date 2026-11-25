/**
 * Optional data-level access hook for the auth-rbac module.
 *
 * Page-level permissions control which pages a user can visit.
 * The resource access hook adds a second dimension: within a page
 * the user CAN access, which specific resources (rows, records)
 * can they see?
 *
 * This is entirely optional. If no callback is registered, all data
 * within accessible pages is visible to the user. The consuming app
 * registers a callback during startup if it needs row-level filtering.
 *
 * Example use cases:
 * - Accounting app: user can only see accounts they are assigned to
 * - CRM: user can only see contacts they own
 * - Project management: user can only see projects in their team
 *
 * @example
 * ```ts
 * // In app startup (e.g., instrumentation.ts or a layout)
 * import { registerResourceAccessHook } from "@/modules/auth-rbac";
 *
 * registerResourceAccessHook(async (userId, companyId, pageKey, resourceType, resourceId) => {
 *   if (resourceType === "account") {
 *     // Check if user has access to this specific account
 *     const access = await prisma.account.findUnique({
 *       where: { id: resourceId },
 *       select: { id: true },
 *     });
 *     return !!access;
 *   }
 *   // All other resource types: visible by default
 *   return true;
 * });
 * ```
 */

/**
 * Callback signature for the resource access hook.
 *
 * @param userId - The authenticated user's ID
 * @param companyId - The active company ID
 * @param pageKey - The page registry key the user is accessing (e.g., "journal", "accounts")
 * @param resourceType - App-defined resource type (e.g., "account", "journal-entry", "contact")
 * @param resourceId - The specific resource ID being accessed
 * @returns Promise<boolean> - true if the user can access this resource, false to deny
 */
export type OnResourceAccessCallback = (
  userId: number,
  companyId: number,
  pageKey: string,
  resourceType: string,
  resourceId: number
) => Promise<boolean>;

/**
 * Module-level singleton holding the registered callback.
 * null means no callback registered — all access is allowed.
 */
let registeredCallback: OnResourceAccessCallback | null = null;

/**
 * Register a callback for data-level access filtering.
 *
 * Only one callback can be registered at a time. Calling this function
 * again replaces the previous callback. This is by design — the consuming
 * app has one central place to define its resource access rules.
 *
 * Call this during app startup (e.g., in a server-side initialization file).
 *
 * @param callback - The callback to invoke for each resource access check
 */
export function registerResourceAccessHook(callback: OnResourceAccessCallback): void {
  registeredCallback = callback;
}

/**
 * Check if a user can access a specific resource.
 *
 * If no callback is registered, returns true (all data visible).
 * If a callback is registered, delegates to it.
 *
 * This function is called by the module's data-fetching layer when
 * loading resources for a page. It is NOT called for page-level access
 * (that's handled by getPageAccessLevel / requirePageAccess).
 *
 * @param userId - The authenticated user's ID
 * @param companyId - The active company ID
 * @param pageKey - The page being accessed
 * @param resourceType - The type of resource
 * @param resourceId - The specific resource ID
 * @returns true if access is allowed
 */
export async function checkResourceAccess(
  userId: number,
  companyId: number,
  pageKey: string,
  resourceType: string,
  resourceId: number
): Promise<boolean> {
  if (!registeredCallback) {
    return true;
  }

  return registeredCallback(userId, companyId, pageKey, resourceType, resourceId);
}

/**
 * Remove the registered callback. Intended for testing only.
 *
 * After calling this, checkResourceAccess returns true for all resources.
 */
export function clearResourceAccessHook(): void {
  registeredCallback = null;
}

/**
 * Check if a resource access hook is currently registered.
 * Useful for conditional logic — skip resource filtering if no hook exists.
 */
export function hasResourceAccessHook(): boolean {
  return registeredCallback !== null;
}
