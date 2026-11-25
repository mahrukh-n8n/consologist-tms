import { getUserRole } from "./get-user-role";
import { hasPermission } from "./permissions";
import type { Module, Action } from "./permissions";

/**
 * Custom error class for permission denials.
 * Distinguishes permission errors from other application errors.
 */
export class PermissionError extends Error {
  public readonly code = "PERMISSION_DENIED" as const;
  public readonly module: Module;
  public readonly action: Action;

  constructor(message: string, module: Module, action: Action) {
    super(message);
    this.name = "PermissionError";
    this.module = module;
    this.action = action;
  }
}

/**
 * Check if a user has permission to perform an action on a module.
 *
 * Always fetches the role from the database (never cached).
 * Returns false if the user has no role in the company.
 *
 * @param userId - The local user ID
 * @param companyId - The company ID to check permission in
 * @param module - The application module (e.g. "journal", "settings")
 * @param action - The action to perform (e.g. "read", "write", "admin")
 * @returns true if the user has the required permission
 */
export async function checkPermission(
  userId: number,
  companyId: number,
  module: Module,
  action: Action
): Promise<boolean> {
  const role = await getUserRole(userId, companyId);

  if (!role) {
    return false;
  }

  return hasPermission(role, module, action);
}

/**
 * Require that a user has permission to perform an action on a module.
 *
 * Throws a PermissionError if the user lacks the required permission.
 * Always fetches the role from the database (never cached).
 *
 * @param userId - The local user ID
 * @param companyId - The company ID to check permission in
 * @param module - The application module
 * @param action - The required action
 * @throws {PermissionError} if the user lacks the required permission
 */
export async function requirePermission(
  userId: number,
  companyId: number,
  module: Module,
  action: Action
): Promise<void> {
  const allowed = await checkPermission(userId, companyId, module, action);

  if (!allowed) {
    throw new PermissionError(
      `Insufficient permissions: cannot perform "${action}" on "${module}"`,
      module,
      action
    );
  }
}
