"use client";

import type { ReactNode } from "react";
import { usePagePermission } from "../hooks/use-page-permission";

interface MutationGuardProps {
  /** The page registry key to check write access against */
  pageKey: string;
  /** Content to render when the user has write access */
  children: ReactNode;
  /**
   * Optional fallback when the user is read-only.
   * If not provided, nothing is rendered.
   * Use this to show a "View only" badge or similar indicator.
   */
  fallback?: ReactNode;
}

/**
 * Conditionally renders children based on write access to a page.
 *
 * Wraps mutation UI elements (Add, Edit, Delete buttons) so they are
 * hidden for ReadOnly users. This is UI-only enforcement — the server
 * action wrapper (withPagePermission) provides the authoritative check.
 *
 * @example
 * ```tsx
 * <MutationGuard pageKey="journal">
 *   <Button onClick={handleCreate}>New Entry</Button>
 *   <Button onClick={handleEdit}>Edit</Button>
 *   <Button onClick={handleDelete}>Delete</Button>
 * </MutationGuard>
 *
 * <MutationGuard pageKey="accounts" fallback={<Badge variant="outline">View only</Badge>}>
 *   <Button>Add Account</Button>
 * </MutationGuard>
 * ```
 */
export function MutationGuard({ pageKey, children, fallback }: MutationGuardProps) {
  const { canWrite } = usePagePermission(pageKey);

  if (canWrite) {
    return <>{children}</>;
  }

  return <>{fallback ?? null}</>;
}
