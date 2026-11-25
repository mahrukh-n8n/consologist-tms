/**
 * auth-rbac module — services barrel
 *
 * Re-exports all public services for the auth-rbac module.
 * Populated by subsequent plans in Phase 41.
 *
 * Will contain: permission resolution service.
 */

// Resource access hook (optional data-level filtering)
export * from "./resource-hook";

// Permission audit service — single gatekeeper for all permission audit writes
export { recordPermissionChange } from "./audit-service";

// Permission audit query service — tiered visibility for reading audit log
export {
  getPermissionAuditLog,
  type PermissionAuditLogFilters,
  type PermissionAuditLogQuery,
  type PermissionAuditLogEntry,
  type PermissionAuditLogResult,
} from "./audit-query-service";
