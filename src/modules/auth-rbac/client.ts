/**
 * auth-rbac module — CLIENT-SAFE entry point
 *
 * Import from "@/modules/auth-rbac/client" in any "use client" component.
 * This barrel contains NO server-only dependencies (no Prisma, no Node built-ins).
 *
 * For server components and server actions, continue importing from "@/modules/auth-rbac".
 */

// Types (pure TypeScript — no runtime deps)
export * from "./types";

// Models (Prisma TYPE re-exports only — import type, not runtime values)
export type {
  PermissionTemplate,
  PermissionTemplatePage,
  UserPermissionAssignment,
  UserPermissionOverride,
  PermissionAuditLog,
  PrismaAccessLevel,
} from "./models/prisma-types";

// Registry — PageRegistry class and singleton (no Prisma imports)
export { PageRegistry, pageRegistry } from "./registry";

// Utils — audit-formatter only (audit-schemas is type-only too)
export { formatAuditDelta } from "./utils/audit-formatter";
export type { AuditDeltaResult, AuditFieldChange } from "./utils/audit-formatter";
export type {
  PageAccessSnapshot,
  TemplateAuditState,
  CloneSourceAuditState,
  AssignmentAuditState,
  OverrideAuditState,
} from "./utils/audit-schemas";

// Hooks (React hooks — client-safe by definition)
export * from "./hooks";

// Components — PermissionProvider and context (client-safe React context)
export { PermissionProvider, PermissionContext, ApprovalRequiredContext } from "./middleware/permission-provider";
export type { PagePermissionsMap } from "./middleware/permission-provider";
