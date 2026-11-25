/**
 * Permission Audit Log — Before/After State Schemas
 *
 * These interfaces document the expected JSON structure stored in
 * PermissionAuditLog.beforeState and PermissionAuditLog.afterState
 * for each PermissionAuditActionType.
 *
 * The audit-service writes these as JSON. The audit-formatter reads
 * them back to produce human-readable output. Both sides must agree
 * on the shape.
 *
 * Schema mapping by action type:
 *
 * | Action Type        | beforeState                   | afterState             |
 * |--------------------|-------------------------------|------------------------|
 * | TEMPLATE_CREATED   | null                          | TemplateAuditState     |
 * | TEMPLATE_EDITED    | TemplateAuditState            | TemplateAuditState     |
 * | TEMPLATE_CLONED    | CloneSourceAuditState         | TemplateAuditState     |
 * | TEMPLATE_DELETED   | TemplateAuditState            | null                   |
 * | TEMPLATE_ASSIGNED  | AssignmentAuditState | null  | AssignmentAuditState   |
 * | TEMPLATE_REMOVED   | AssignmentAuditState          | null                   |
 * | OVERRIDE_ADDED     | OverrideAuditState            | OverrideAuditState     |
 * | OVERRIDE_REMOVED   | OverrideAuditState            | OverrideAuditState     |
 * | MCP_WRITES         | McpWritesAuditState           | McpWritesAuditState    |
 */

/** Page access levels snapshot: Record<pageKey, AccessLevel string> */
export type PageAccessSnapshot = Record<string, string>;

/** Template state — used for TEMPLATE_CREATED, TEMPLATE_EDITED, TEMPLATE_DELETED */
export interface TemplateAuditState {
  templateId: number;
  templateName: string;
  pages: PageAccessSnapshot;
}

/** Clone source state — used for TEMPLATE_CLONED beforeState */
export interface CloneSourceAuditState {
  sourceTemplateId: number;
  sourceTemplateName: string;
}

/** Assignment state — used for TEMPLATE_ASSIGNED, TEMPLATE_REMOVED */
export interface AssignmentAuditState {
  templateId: number;
  templateName: string;
}

/** Override state — used for OVERRIDE_ADDED, OVERRIDE_REMOVED */
export interface OverrideAuditState {
  pageKey: string;
  previousLevel?: string; // level before this change (from template or old override)
  newLevel?: string; // level after this change
  overrideLevel?: string; // the override's own level (for removal)
  revertedToLevel?: string; // what it reverts to after removal (template default)
}

/** MCP write toggle state - used for MCP_WRITES */
export interface McpWritesAuditState {
  enabled: boolean;
}
