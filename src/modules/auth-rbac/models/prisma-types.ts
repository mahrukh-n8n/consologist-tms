/**
 * Re-exports of Prisma-generated types for the permission domain.
 *
 * Consumers import these from "@/modules/auth-rbac" instead of
 * reaching into "@/generated/prisma" directly. This provides:
 * 1. A stable import path if Prisma output location changes
 * 2. Documentation of which models belong to this domain
 * 3. The ability to augment types in the future (e.g., adding computed fields)
 *
 * NOTE: This is the ONE place in the module that imports from @/generated/prisma.
 * All other module files use the types re-exported from ../types/ (for enums/interfaces)
 * or from here (for Prisma model types).
 */
export type {
  PermissionTemplate,
  PermissionTemplatePage,
  UserPermissionAssignment,
  UserPermissionOverride,
  PermissionAuditLog,
  AccessLevel as PrismaAccessLevel,
} from "@/generated/prisma/client";
