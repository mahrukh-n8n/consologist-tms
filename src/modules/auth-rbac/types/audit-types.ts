/**
 * Permission audit action types and input interface.
 *
 * String enum ensures stored values in the JSON column are human-readable
 * without a lookup table.
 */

export enum PermissionAuditActionType {
  TEMPLATE_CREATED = "TEMPLATE_CREATED",
  TEMPLATE_EDITED = "TEMPLATE_EDITED",
  TEMPLATE_CLONED = "TEMPLATE_CLONED",
  TEMPLATE_DELETED = "TEMPLATE_DELETED",
  TEMPLATE_ASSIGNED = "TEMPLATE_ASSIGNED",
  TEMPLATE_REMOVED = "TEMPLATE_REMOVED",
  OVERRIDE_ADDED = "OVERRIDE_ADDED",
  OVERRIDE_REMOVED = "OVERRIDE_REMOVED",
  MCP_WRITES = "MCP_WRITES",
}

export interface RecordPermissionChangeInput {
  companyId: number;
  actorId: number;
  /** null for template-only actions (create, edit, clone, delete) */
  targetUserId: number | null;
  actionType: PermissionAuditActionType;
  /** null for CREATE actions */
  beforeState: Record<string, unknown> | null;
  /** null for DELETE actions */
  afterState: Record<string, unknown> | null;
}
