"use client";

import { createContext, type ReactNode } from "react";

/**
 * Map of pageKey -> access level string ("NONE" | "READ_ONLY" | "READ_WRITE").
 * Resolved server-side and passed as a serializable prop.
 */
export type PagePermissionsMap = Record<string, string>;

export const PermissionContext = createContext<PagePermissionsMap | null>(null);

/**
 * Set of pageKeys where the user requires approval for writes.
 * When a page is in this set, the user can only create (pending) — not modify.
 * UI should hide mutation buttons for these pages.
 */
export const ApprovalRequiredContext = createContext<Set<string>>(new Set());

interface PermissionProviderProps {
  permissions: PagePermissionsMap;
  approvalRequiredPages?: string[];
  children: ReactNode;
}

/**
 * Provides the resolved page permissions map to the client tree.
 *
 * This is a thin wrapper around React context. All resolution happens
 * server-side (in the dashboard layout). The provider only passes the
 * pre-resolved map to the client tree.
 */
export function PermissionProvider({ permissions, approvalRequiredPages = [], children }: PermissionProviderProps) {
  const approvalSet = new Set(approvalRequiredPages);
  return (
    <PermissionContext.Provider value={permissions}>
      <ApprovalRequiredContext.Provider value={approvalSet}>
        {children}
      </ApprovalRequiredContext.Provider>
    </PermissionContext.Provider>
  );
}
