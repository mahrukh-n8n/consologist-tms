import { AccessLevel } from "../types/access-level";
import { getEffectivePagePermission, shouldRequireApproval } from "../services/assignment-service";
import { getUserRole } from "@/lib/auth/get-user-role";
import { Role } from "@/generated/prisma/enums";
import { PermissionError } from "@/lib/auth/check-permission";
import type { Module, Action } from "@/lib/auth/permissions";

export { AccessLevel };

/**
 * Returns the effective access level for a user on a page without throwing.
 *
 * SUPER_ADMIN always gets READ_WRITE immediately — no DB lookup for effective
 * permission. All other users are resolved through the template + override chain.
 *
 * Use this in UI code to decide what controls to render.
 */
export async function getPageAccessLevel(
  userId: number,
  companyId: number,
  pageKey: string
): Promise<AccessLevel> {
  const role = await getUserRole(userId, companyId);
  if (role === Role.SUPER_ADMIN) {
    return AccessLevel.READ_WRITE;
  }

  return getEffectivePagePermission(userId, companyId, pageKey);
}

/**
 * Requires that the user has at least READ_ONLY access to the page.
 *
 * Throws PermissionError when access level is NONE.
 * Returns the actual access level (READ_ONLY or READ_WRITE) so callers can
 * branch on write access without a second DB call.
 */
export async function requirePageAccess(
  userId: number,
  companyId: number,
  pageKey: string
): Promise<AccessLevel> {
  const level = await getPageAccessLevel(userId, companyId, pageKey);

  if (level === AccessLevel.NONE) {
    throw new PermissionError(
      `Access denied: no permission for page "${pageKey}"`,
      "settings" as Module,
      "read" as Action
    );
  }

  return level;
}

/**
 * Requires that the user has READ_WRITE access to the page AND does not
 * require approval for this page.
 *
 * Throws PermissionError when:
 *   - access level is NONE or READ_ONLY
 *   - user has requiresApproval=true for this page (maker-checker: makers
 *     can only create via requireWriteGate, not modify existing entities)
 *
 * Used by non-creation mutation server actions (updates, deletes, adding costs, etc.)
 */
export async function requirePageWrite(
  userId: number,
  companyId: number,
  pageKey: string
): Promise<void> {
  const level = await getPageAccessLevel(userId, companyId, pageKey);

  if (level !== AccessLevel.READ_WRITE) {
    throw new PermissionError(
      `Write access denied for page "${pageKey}" (current level: ${level})`,
      "settings" as Module,
      "write" as Action
    );
  }

  // Maker-checker gate: users with requiresApproval can only create (via
  // requireWriteGate), not modify existing entities on this page.
  const needsApproval = await getPageApprovalRequired(userId, companyId, pageKey);
  if (needsApproval) {
    throw new PermissionError(
      `Modifications require approval on page "${pageKey}". Only new entries can be created (via the approval workflow).`,
      "settings" as Module,
      "write" as Action
    );
  }
}

/**
 * Returns whether the user requires approval for mutations on a given page.
 * SUPER_ADMIN always returns false.
 */
export async function getPageApprovalRequired(
  userId: number,
  companyId: number,
  pageKey: string
): Promise<boolean> {
  const role = await getUserRole(userId, companyId);
  if (role === Role.SUPER_ADMIN) return false;
  return shouldRequireApproval(userId, companyId, pageKey);
}

/**
 * WriteGate result — returned by requireWriteGate.
 *
 * After creating the entity, call `gate.submitIfNeeded(entityType, entityId)`
 * to handle approval routing. This is the ONLY approved pattern for entity
 * creation on approval-supported pages.
 */
export interface WriteGate {
  /** Whether this user needs approval for this page */
  needsApproval: boolean;
  /** The authenticated user's ID */
  userId: number;
  /** The company ID */
  companyId: number;
  /** The page key */
  pageKey: string;
}

/**
 * Single centralized gate for all entity-creating server actions.
 *
 * Combines:
 * 1. requirePageWrite (throws if no write access)
 * 2. getPageApprovalRequired (checks if approval needed)
 *
 * Returns a WriteGate that includes `needsApproval`. After entity creation,
 * the caller MUST call `submitForApprovalIfNeeded(gate, entityType, entityId)`
 * to complete the approval flow.
 *
 * This ensures NO server action can forget the approval check — it's bundled
 * with the permission check in a single call.
 */
export async function requireWriteGate(
  userId: number,
  companyId: number,
  pageKey: string
): Promise<WriteGate> {
  // Step 1: Enforce READ_WRITE access (but NOT the maker-checker block —
  // that's only for non-creation mutations via requirePageWrite).
  const level = await getPageAccessLevel(userId, companyId, pageKey);

  if (level !== AccessLevel.READ_WRITE) {
    throw new PermissionError(
      `Write access denied for page "${pageKey}" (current level: ${level})`,
      "settings" as Module,
      "write" as Action
    );
  }

  // Step 2: Check approval requirement
  const needsApproval = await getPageApprovalRequired(userId, companyId, pageKey);

  return { needsApproval, userId, companyId, pageKey };
}
