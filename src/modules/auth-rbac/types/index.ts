/**
 * auth-rbac module — types barrel
 *
 * Re-exports all public types, enums, and interfaces for the auth-rbac module.
 * This is the canonical import point for all type-level exports.
 */

// ── Enums ───────────────────────────────────────────────────
export { AccessLevel, ACCESS_LEVEL_WEIGHT, isAtLeast } from "./access-level";
export { PermissionChangeAction, PERMISSION_ACTION_LABELS } from "./permission-change-action";

// ── Interfaces & Types ──────────────────────────────────────
export type { PageDefinition } from "./page-definition";
export type { PermissionCheckResult, PermissionSource } from "./permission-check-result";
export { PermissionAuditActionType } from "./audit-types";
export type { RecordPermissionChangeInput } from "./audit-types";
