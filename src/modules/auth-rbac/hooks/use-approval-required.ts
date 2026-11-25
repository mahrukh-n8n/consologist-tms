"use client";

import { useContext } from "react";
import { ApprovalRequiredContext } from "../middleware/permission-provider";

/**
 * Returns whether the current user requires approval for mutations on a given page.
 *
 * When true, the UI should hide all mutation buttons (edit, delete, add cost, etc.)
 * except the "Create" button (which routes through the approval workflow).
 *
 * Server-side enforcement is handled by `requirePageWrite` (blocks when approval required).
 * This hook is for UI-level hiding only.
 */
export function useApprovalRequired(pageKey: string): boolean {
  const approvalSet = useContext(ApprovalRequiredContext);
  return approvalSet.has(pageKey);
}
