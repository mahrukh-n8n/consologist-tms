import { requireCompany } from "@/lib/company/require-company";
import { checkPermission } from "@/lib/auth/check-permission";
import type { Module, Action } from "@/lib/auth/permissions";

interface PermissionGateProps {
  /** The application module to check permission for */
  module: Module;
  /** The action required on the module */
  action: Action;
  /** Content to render if the user has permission */
  children: React.ReactNode;
  /** Optional fallback content when permission is denied */
  fallback?: React.ReactNode;
}

/**
 * Server Component that conditionally renders children based on RBAC permissions.
 *
 * Checks the user's role in their active company against the permission matrix.
 * If the user has the required permission, renders children. Otherwise renders
 * the fallback (or nothing).
 *
 * Security note: This component is for UI gating only. All mutations must
 * independently verify permissions via requirePermission() in Server Actions.
 *
 * @example
 * ```tsx
 * <PermissionGate module="settings" action="admin">
 *   <AdminSettingsPanel />
 * </PermissionGate>
 *
 * <PermissionGate module="journal" action="write" fallback={<ReadOnlyView />}>
 *   <JournalEditor />
 * </PermissionGate>
 * ```
 */
export async function PermissionGate({
  module,
  action,
  children,
  fallback,
}: PermissionGateProps) {
  const { user, company } = await requireCompany();
  const allowed = await checkPermission(user.id, company.id, module, action);

  if (allowed) {
    return <>{children}</>;
  }

  return <>{fallback ?? null}</>;
}
