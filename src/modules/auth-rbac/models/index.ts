/**
 * auth-rbac module — models barrel
 *
 * Re-exports Prisma-generated types for the permission domain.
 * Consumers import these from "@/modules/auth-rbac" via the root barrel.
 */

export type {
  PermissionTemplate,
  PermissionTemplatePage,
  UserPermissionAssignment,
  UserPermissionOverride,
  PermissionAuditLog,
  PrismaAccessLevel,
} from "./prisma-types";
