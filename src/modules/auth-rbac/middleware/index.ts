/**
 * auth-rbac module — middleware barrel
 *
 * Re-exports all public middleware for the auth-rbac module.
 */

export { getPageAccessLevel, requirePageAccess, requirePageWrite, getPageApprovalRequired, requireWriteGate } from "./page-access";
export type { WriteGate } from "./page-access";
export { withPagePermission } from "./with-page-permission";
export { PermissionProvider } from "./permission-provider";
export type { PagePermissionsMap } from "./permission-provider";
