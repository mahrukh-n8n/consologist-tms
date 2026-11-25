"use client";

import { useContext } from "react";
import { PermissionContext } from "../middleware/permission-provider";

interface PagePermissionResult {
  /** The raw access level string: "NONE" | "READ_ONLY" | "READ_WRITE" */
  accessLevel: string;
  /** True if the user can view the page (READ_ONLY or READ_WRITE) */
  canRead: boolean;
  /** True if the user can perform mutations (READ_WRITE only) */
  canWrite: boolean;
  /** True if the user has no access at all */
  isNone: boolean;
}

/**
 * Client-side hook to check the current user's access level for a page.
 *
 * Reads from PermissionContext (populated by PermissionProvider in dashboard layout).
 * If no context is available (module not configured), returns full access as a safe fallback.
 *
 * @param pageKey - The page registry key to check
 * @returns Permission result with convenience booleans
 *
 * @example
 * ```tsx
 * const { canWrite } = usePagePermission("journal");
 * // Use canWrite to conditionally render mutation buttons
 * ```
 */
export function usePagePermission(pageKey: string): PagePermissionResult {
  const permissions = useContext(PermissionContext);

  // Fallback: if no context or no entry for this page, assume full access
  // This ensures existing pages work before page keys are wired up
  if (!permissions || !(pageKey in permissions)) {
    return {
      accessLevel: "READ_WRITE",
      canRead: true,
      canWrite: true,
      isNone: false,
    };
  }

  const level = permissions[pageKey] ?? "READ_WRITE";

  return {
    accessLevel: level,
    canRead: level === "READ_ONLY" || level === "READ_WRITE",
    canWrite: level === "READ_WRITE",
    isNone: level === "NONE",
  };
}
