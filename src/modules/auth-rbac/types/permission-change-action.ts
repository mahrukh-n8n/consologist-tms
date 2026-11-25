/**
 * All auditable permission change actions.
 *
 * Used as the `actionType` value in PermissionAuditLog records.
 * Stored as a plain string in the database (not a Prisma enum) to allow
 * adding new actions without schema migration.
 */
export enum PermissionChangeAction {
  /** A permission template was assigned to a user */
  TEMPLATE_ASSIGNED = "TEMPLATE_ASSIGNED",

  /** A user's template assignment was removed */
  TEMPLATE_UNASSIGNED = "TEMPLATE_UNASSIGNED",

  /** A per-user permission override was added for a specific page */
  OVERRIDE_ADDED = "OVERRIDE_ADDED",

  /** A per-user permission override was removed */
  OVERRIDE_REMOVED = "OVERRIDE_REMOVED",

  /** A new permission template was created */
  TEMPLATE_CREATED = "TEMPLATE_CREATED",

  /** An existing permission template's pages/levels were edited */
  TEMPLATE_EDITED = "TEMPLATE_EDITED",

  /** A permission template was deleted */
  TEMPLATE_DELETED = "TEMPLATE_DELETED",

  /** A permission template was cloned from another */
  TEMPLATE_CLONED = "TEMPLATE_CLONED",
}

/**
 * Human-readable labels for audit log display.
 */
export const PERMISSION_ACTION_LABELS: Record<PermissionChangeAction, string> = {
  [PermissionChangeAction.TEMPLATE_ASSIGNED]: "Template Assigned",
  [PermissionChangeAction.TEMPLATE_UNASSIGNED]: "Template Unassigned",
  [PermissionChangeAction.OVERRIDE_ADDED]: "Override Added",
  [PermissionChangeAction.OVERRIDE_REMOVED]: "Override Removed",
  [PermissionChangeAction.TEMPLATE_CREATED]: "Template Created",
  [PermissionChangeAction.TEMPLATE_EDITED]: "Template Edited",
  [PermissionChangeAction.TEMPLATE_DELETED]: "Template Deleted",
  [PermissionChangeAction.TEMPLATE_CLONED]: "Template Cloned",
};
