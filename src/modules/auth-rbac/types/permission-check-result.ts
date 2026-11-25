import { AccessLevel } from "./access-level";

/**
 * Source of the resolved permission — tells the caller WHY a user has
 * the access level they have.
 */
export type PermissionSource =
  /** Access level comes from a UserPermissionOverride record */
  | "override"
  /** Access level comes from the assigned PermissionTemplate */
  | "template"
  /** No template assigned and no override — falls back to default (NONE) */
  | "default";

/**
 * Result of resolving a user's effective permission for a specific page.
 *
 * Returned by the permission resolution service (implemented in Phase 42+).
 * Structured to give callers everything they need for both enforcement
 * (allowed/effectiveLevel) and UI display (source, templateName, metadata).
 */
export interface PermissionCheckResult {
  /** Whether the user is allowed to access the page at the required level */
  allowed: boolean;

  /** The user's effective access level for this page */
  effectiveLevel: AccessLevel;

  /** Where the effective level came from */
  source: PermissionSource;

  /** Name of the assigned template (if source is "template") */
  templateName?: string;

  /** ID of the template (if source is "template") */
  templateId?: number;

  /** ID of the override record (if source is "override") */
  overrideId?: number;

  /** The pageKey that was checked */
  pageKey: string;

  /** The required access level that was checked against */
  requiredLevel: AccessLevel;
}
