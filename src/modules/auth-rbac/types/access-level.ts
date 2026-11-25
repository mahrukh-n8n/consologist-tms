/**
 * Access levels for page-level permissions.
 *
 * Mirrors the Prisma AccessLevel enum exactly. We re-declare it here so that
 * application code can import from the module without coupling to
 * @/generated/prisma directly.
 *
 * Values are ordered from least to most permissive:
 *   NONE < READ_ONLY < READ_WRITE
 *
 * Resolution order:
 *   1. UserPermissionOverride (if exists for this user + company + pageKey)
 *   2. PermissionTemplatePage (from the user's assigned template)
 *   3. Default: NONE (no access unless explicitly granted)
 */
export enum AccessLevel {
  /** No access — page is hidden and server actions are blocked */
  NONE = "NONE",

  /** Read-only — page is visible, all mutation actions are blocked */
  READ_ONLY = "READ_ONLY",

  /** Full access — page is visible, all actions are allowed */
  READ_WRITE = "READ_WRITE",
}

/**
 * Numeric weight for comparing access levels.
 * Higher = more permissive.
 */
export const ACCESS_LEVEL_WEIGHT: Record<AccessLevel, number> = {
  [AccessLevel.NONE]: 0,
  [AccessLevel.READ_ONLY]: 1,
  [AccessLevel.READ_WRITE]: 2,
};

/**
 * Check if one access level is at least as permissive as another.
 *
 * @example
 *   isAtLeast(AccessLevel.READ_WRITE, AccessLevel.READ_ONLY) // true
 *   isAtLeast(AccessLevel.NONE, AccessLevel.READ_ONLY)       // false
 */
export function isAtLeast(
  actual: AccessLevel,
  required: AccessLevel
): boolean {
  return ACCESS_LEVEL_WEIGHT[actual] >= ACCESS_LEVEL_WEIGHT[required];
}
