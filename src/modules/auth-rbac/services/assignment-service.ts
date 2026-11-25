import type {
  PrismaClient,
  UserPermissionAssignment,
  UserPermissionOverride,
} from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { AccessLevel } from "../types/access-level";
import { pageRegistry } from "../registry/page-registry";
import { recordPermissionChange } from "./audit-service";
import { PermissionAuditActionType } from "../types/audit-types";

// ---------------------------------------------------------------------------
// Input / Output Types
// ---------------------------------------------------------------------------

export interface AssignTemplateInput {
  userId: number;
  companyId: number;
  templateId: number;
  assignedBy: number;
}

export interface RemoveAssignmentInput {
  userId: number;
  companyId: number;
  removedBy: number;
}

export interface AddOverrideInput {
  userId: number;
  companyId: number;
  pageKey: string;
  accessLevel: AccessLevel;
  setBy: number;
}

export interface RemoveOverrideInput {
  userId: number;
  companyId: number;
  pageKey: string;
  removedBy: number;
}

export interface UserOverrideWithDefault {
  pageKey: string;
  overrideAccessLevel: AccessLevel;
  templateDefaultAccessLevel: AccessLevel;
  pageName: string;
  pageSection: string;
}

export interface EffectivePermission {
  pageKey: string;
  accessLevel: AccessLevel;
  source: "template" | "override" | "super_admin";
}

const PAGE_KEY_ALIASES: Record<string, string[]> = {
  "box-configs": ["tools-box-configs"],
  "tools-box-configs": ["box-configs"],
};

function canonicalizePageKey(pageKey: string): string {
  return pageKey === "tools-box-configs" ? "box-configs" : pageKey;
}

function getPageKeyVariants(pageKey: string): string[] {
  return Array.from(new Set([pageKey, ...(PAGE_KEY_ALIASES[pageKey] ?? [])]));
}

// ---------------------------------------------------------------------------
// Mutation Functions (receive a Prisma transaction client)
// ---------------------------------------------------------------------------

/**
 * Assign a permission template to a user in a company.
 *
 * Validates:
 * - Template must exist and belong to the company
 * - User must be a member of the company (have a UserCompanyRole)
 *
 * Upsert semantics: if the user already has an assignment, replace it.
 * Creates a PermissionAuditLog entry with before/after delta.
 *
 * @param tx - Prisma transaction client
 * @param input - Assignment inputs
 * @returns The upserted UserPermissionAssignment
 */
export async function assignTemplate(
  tx: PrismaClient,
  input: AssignTemplateInput
): Promise<UserPermissionAssignment> {
  const { userId, companyId, templateId, assignedBy } = input;

  // Validate: template must exist in this company
  const template = await tx.permissionTemplate.findFirst({
    where: { id: templateId, companyId },
    select: { id: true, name: true },
  });
  if (!template) {
    throw new Error("Template not found in this company");
  }

  // Validate: user must be a member of this company
  const membership = await tx.userCompanyRole.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: { userId: true },
  });
  if (!membership) {
    throw new Error("User is not a member of this company");
  }

  // Check for existing assignment (for audit delta)
  const existingAssignment = await tx.userPermissionAssignment.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: {
      templateId: true,
      template: { select: { name: true } },
    },
  });

  const previousTemplateId = existingAssignment?.templateId ?? null;
  const previousTemplateName = existingAssignment?.template?.name ?? null;

  // Upsert the assignment
  const assignment = await tx.userPermissionAssignment.upsert({
    where: { userId_companyId: { userId, companyId } },
    create: { userId, companyId, templateId, assignedBy },
    update: { templateId, assignedBy },
  });

  // Record audit entry
  await recordPermissionChange(tx, {
    companyId,
    actorId: assignedBy,
    targetUserId: userId,
    actionType: PermissionAuditActionType.TEMPLATE_ASSIGNED,
    beforeState: previousTemplateId !== null
      ? { templateId: previousTemplateId, templateName: previousTemplateName }
      : null,
    afterState: { templateId, templateName: template.name },
  });

  return assignment;
}

/**
 * Remove a user's permission assignment (and all overrides) in a company.
 *
 * Deletes:
 * - All UserPermissionOverride rows for this user+company
 * - The UserPermissionAssignment row
 *
 * Creates a PermissionAuditLog entry with action TEMPLATE_REMOVED.
 *
 * @param tx - Prisma transaction client
 * @param input - Removal inputs
 */
export async function removeAssignment(
  tx: PrismaClient,
  input: RemoveAssignmentInput
): Promise<void> {
  const { userId, companyId, removedBy } = input;

  // Validate: must have an existing assignment
  const existingAssignment = await tx.userPermissionAssignment.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: {
      templateId: true,
      template: { select: { name: true } },
    },
  });
  if (!existingAssignment) {
    throw new Error("No permission assignment found for this user");
  }

  const removedTemplateName = existingAssignment.template?.name ?? null;

  // Delete all overrides for this user+company
  const overrideDeleteResult = await tx.userPermissionOverride.deleteMany({
    where: { userId, companyId },
  });

  // Delete the assignment
  await tx.userPermissionAssignment.delete({
    where: { userId_companyId: { userId, companyId } },
  });

  // Record audit entry
  await recordPermissionChange(tx, {
    companyId,
    actorId: removedBy,
    targetUserId: userId,
    actionType: PermissionAuditActionType.TEMPLATE_REMOVED,
    beforeState: {
      templateId: existingAssignment.templateId,
      templateName: removedTemplateName,
      overridesDeleted: overrideDeleteResult.count,
    },
    afterState: null,
  });
}

/**
 * Add (or update) a per-user override for a specific page.
 *
 * Validates:
 * - User must have a UserPermissionAssignment in this company
 * - pageKey must be registered in the page registry
 * - accessLevel must be a valid AccessLevel value
 *
 * Upsert semantics: if an override already exists, it is updated.
 * Creates a PermissionAuditLog entry with before/after delta.
 *
 * @param tx - Prisma transaction client
 * @param input - Override inputs
 * @returns The upserted UserPermissionOverride
 */
export async function addOverride(
  tx: PrismaClient,
  input: AddOverrideInput
): Promise<UserPermissionOverride> {
  const { userId, companyId, pageKey, accessLevel, setBy } = input;
  const canonicalPageKey = canonicalizePageKey(pageKey);
  const pageKeyVariants = getPageKeyVariants(pageKey);

  // Validate: user must have an assignment in this company
  const assignment = await tx.userPermissionAssignment.findUnique({
    where: { userId_companyId: { userId, companyId } },
    include: {
      template: {
        include: { pages: { where: { pageKey: { in: pageKeyVariants } } } },
      },
    },
  });
  if (!assignment) {
    throw new Error(
      "Cannot add override: user has no permission template assigned. Assign a template first."
    );
  }

  // Validate: pageKey must exist in the page registry
  if (!pageRegistry.hasPage(canonicalPageKey)) {
    throw new Error(`Unknown page key: ${canonicalPageKey}`);
  }

  // Validate: accessLevel must be a valid enum value
  if (!["NONE", "READ_ONLY", "READ_WRITE"].includes(accessLevel)) {
    throw new Error(`Invalid access level: ${accessLevel}`);
  }

  const templateDefault =
    (assignment.template.pages[0]?.accessLevel as AccessLevel) ??
    AccessLevel.NONE;

  // Check for existing override (for audit delta)
  const existingOverrides = await tx.userPermissionOverride.findMany({
    where: { userId, companyId, pageKey: { in: pageKeyVariants } },
  });
  const existing =
    existingOverrides.find((override) => override.pageKey === canonicalPageKey) ??
    existingOverrides[0];

  let override: UserPermissionOverride;
  if (!existing) {
    override = await tx.userPermissionOverride.create({
      data: { userId, companyId, pageKey: canonicalPageKey, accessLevel, setBy },
    });
  } else if (existing.pageKey === canonicalPageKey) {
    override = await tx.userPermissionOverride.update({
      where: {
        userId_companyId_pageKey: { userId, companyId, pageKey: canonicalPageKey },
      },
      data: { accessLevel, setBy },
    });
  } else {
    override = await tx.userPermissionOverride.update({
      where: {
        userId_companyId_pageKey: { userId, companyId, pageKey: existing.pageKey },
      },
      data: { pageKey: canonicalPageKey, accessLevel, setBy },
    });
  }

  await tx.userPermissionOverride.deleteMany({
    where: {
      userId,
      companyId,
      pageKey: { in: pageKeyVariants.filter((variant) => variant !== canonicalPageKey) },
    },
  });

  // Record audit entry — OVERRIDE_ADDED covers both create and update (upsert semantics)
  await recordPermissionChange(tx, {
    companyId,
    actorId: setBy,
    targetUserId: userId,
    actionType: PermissionAuditActionType.OVERRIDE_ADDED,
    beforeState: {
      pageKey: canonicalPageKey,
      templateDefault,
    },
    afterState: {
      pageKey: canonicalPageKey,
      previousLevel: existing?.accessLevel ?? null,
      newLevel: accessLevel,
    },
  });

  return override;
}

/**
 * Remove a per-user override for a specific page.
 *
 * Validates:
 * - Override must exist
 *
 * Creates a PermissionAuditLog entry recording the removed override value
 * and the template default the user reverts to.
 *
 * @param tx - Prisma transaction client
 * @param input - Removal inputs
 */
export async function removeOverride(
  tx: PrismaClient,
  input: RemoveOverrideInput
): Promise<void> {
  const { userId, companyId, pageKey, removedBy } = input;
  const canonicalPageKey = canonicalizePageKey(pageKey);
  const pageKeyVariants = getPageKeyVariants(pageKey);

  // Validate: override must exist
  const existingOverride = await tx.userPermissionOverride.findFirst({
    where: { userId, companyId, pageKey: { in: pageKeyVariants } },
  });
  if (!existingOverride) {
    throw new Error(`No override found for page '${canonicalPageKey}' on this user`);
  }

  // Look up the template default the user will revert TO
  const assignment = await tx.userPermissionAssignment.findUnique({
    where: { userId_companyId: { userId, companyId } },
    include: {
      template: {
        include: { pages: { where: { pageKey: { in: pageKeyVariants } } } },
      },
    },
  });
  const revertsTo =
    (assignment?.template.pages[0]?.accessLevel as AccessLevel) ??
    AccessLevel.NONE;

  // Delete the override
  await tx.userPermissionOverride.deleteMany({
    where: { userId, companyId, pageKey: { in: pageKeyVariants } },
  });

  // Record audit entry
  await recordPermissionChange(tx, {
    companyId,
    actorId: removedBy,
    targetUserId: userId,
    actionType: PermissionAuditActionType.OVERRIDE_REMOVED,
    beforeState: {
      pageKey: canonicalPageKey,
      overrideLevel: existingOverride.accessLevel,
    },
    afterState: {
      pageKey: canonicalPageKey,
      revertedToLevel: revertsTo,
    },
  });
}

/**
 * Get all current overrides for a user, enriched with template defaults.
 *
 * Returns both the override value and the template default so the UI can
 * display a comparison ("override: READ_WRITE, template default: READ_ONLY").
 *
 * @param userId - Target user
 * @param companyId - Company scope
 * @returns Array of overrides with template defaults, sorted by section then page name
 */
export async function getUserOverrides(
  userId: number,
  companyId: number
): Promise<UserOverrideWithDefault[]> {
  // Get user's assignment with template pages
  const assignment = await prisma.userPermissionAssignment.findUnique({
    where: { userId_companyId: { userId, companyId } },
    include: { template: { include: { pages: true } } },
  });

  if (!assignment) {
    return [];
  }

  // Get all overrides
  const overrides = await prisma.userPermissionOverride.findMany({
    where: { userId, companyId },
  });

  // Build template defaults map
  const templateMap = new Map<string, AccessLevel>();
  for (const page of assignment.template.pages) {
    templateMap.set(canonicalizePageKey(page.pageKey), page.accessLevel as AccessLevel);
  }

  // Build result array
  const result: UserOverrideWithDefault[] = [];
  for (const override of overrides) {
    const canonicalPageKey = canonicalizePageKey(override.pageKey);
    const pageDef = pageRegistry.getPageByKey(canonicalPageKey);
    const templateDefaultAccessLevel =
      templateMap.get(canonicalPageKey) ?? AccessLevel.NONE;

    result.push({
      pageKey: canonicalPageKey,
      overrideAccessLevel: override.accessLevel as AccessLevel,
      templateDefaultAccessLevel,
      pageName: pageDef?.displayName ?? canonicalPageKey,
      pageSection: pageDef?.section ?? "",
    });
  }

  // Sort by section, then pageName
  result.sort((a, b) => {
    const sectionCmp = a.pageSection.localeCompare(b.pageSection);
    if (sectionCmp !== 0) return sectionCmp;
    return a.pageName.localeCompare(b.pageName);
  });

  return result;
}

// ---------------------------------------------------------------------------
// Query Functions (use standard prisma client — NOT a transaction)
// ---------------------------------------------------------------------------

/**
 * Compute the effective permissions for a user in a company.
 *
 * Resolution order:
 * 1. SUPER_ADMIN bypass → all pages at READ_WRITE, source "super_admin"
 * 2. No assignment → empty array (user sees "awaiting" screen)
 * 3. Template pages as base, overrides applied on top
 *
 * @param userId - Target user
 * @param companyId - Company scope
 * @returns Array of effective permissions, one per registered/assigned page
 */
export async function getEffectivePermissions(
  userId: number,
  companyId: number
): Promise<EffectivePermission[]> {
  // Step 1: Get user role — SUPER_ADMIN bypass
  const userCompanyRole = await prisma.userCompanyRole.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: { role: true },
  });

  if (userCompanyRole?.role === Role.SUPER_ADMIN) {
    return pageRegistry.getPages().map((page) => ({
      pageKey: page.pageKey,
      accessLevel: AccessLevel.READ_WRITE,
      source: "super_admin" as const,
    }));
  }

  // Step 2: Get user's assignment with template pages
  const assignment = await prisma.userPermissionAssignment.findUnique({
    where: { userId_companyId: { userId, companyId } },
    include: {
      template: {
        include: { pages: true },
      },
    },
  });

  if (!assignment) {
    return [];
  }

  // Step 3: Build base map from template pages
  const permMap = new Map<string, EffectivePermission>();
  for (const page of assignment.template.pages) {
    const canonicalPageKey = canonicalizePageKey(page.pageKey);
    permMap.set(canonicalPageKey, {
      pageKey: canonicalPageKey,
      accessLevel: page.accessLevel as AccessLevel,
      source: "template",
    });
  }

  // Step 4: Apply overrides on top
  const overrides = await prisma.userPermissionOverride.findMany({
    where: { userId, companyId },
  });
  for (const override of overrides) {
    const canonicalPageKey = canonicalizePageKey(override.pageKey);
    permMap.set(canonicalPageKey, {
      pageKey: canonicalPageKey,
      accessLevel: override.accessLevel as AccessLevel,
      source: "override",
    });
  }

  return Array.from(permMap.values());
}

/**
 * Check if a user has any permission template assigned in a company.
 * Lightweight existence check — does not load template details.
 * Used by the dashboard layout to decide whether to show the awaiting screen.
 *
 * @returns true if the user has a UserPermissionAssignment, false otherwise
 */
export async function hasPermissionAssignment(
  userId: number,
  companyId: number
): Promise<boolean> {
  const assignment = await prisma.userPermissionAssignment.findUnique({
    where: {
      userId_companyId: {
        userId,
        companyId,
      },
    },
    select: { id: true }, // Minimal select — only need existence
  });

  return assignment !== null;
}

/**
 * Determine whether a user requires approval for mutations on a given page.
 *
 * Resolution chain (mirrors getEffectivePagePermission):
 * 1. SUPER_ADMIN -> false (always bypasses)
 * 2. Override exists -> false (overrides don't carry approval flags)
 * 3. Template page requiresApproval -> return that value
 * 4. Default: false
 */
export async function shouldRequireApproval(
  userId: number,
  companyId: number,
  pageKey: string
): Promise<boolean> {
  const pageKeyVariants = getPageKeyVariants(pageKey);

  // Step 1: SUPER_ADMIN bypass
  const userCompanyRole = await prisma.userCompanyRole.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: { role: true },
  });

  if (userCompanyRole?.role === Role.SUPER_ADMIN) {
    return false;
  }

  // Step 2: Check override — overrides don't carry approval flags
  const override = await prisma.userPermissionOverride.findFirst({
    where: { userId, companyId, pageKey: { in: pageKeyVariants } },
    select: { accessLevel: true },
  });
  if (override) {
    return false;
  }

  // Step 3: Check template page
  const assignment = await prisma.userPermissionAssignment.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: {
      template: {
        select: {
          pages: {
            where: { pageKey: { in: pageKeyVariants } },
            select: { requiresApproval: true },
          },
        },
      },
    },
  });

  const templatePage = assignment?.template.pages[0];
  if (templatePage) {
    return templatePage.requiresApproval;
  }

  // Step 4: Default
  return false;
}

/**
 * Fast path: get the effective access level for a single page.
 *
 * Resolution order:
 * 1. SUPER_ADMIN → READ_WRITE immediately
 * 2. Check override first
 * 3. Check template page
 * 4. Default: NONE
 *
 * @param userId - Target user
 * @param companyId - Company scope
 * @param pageKey - The page to check
 * @returns The effective AccessLevel
 */
export async function getEffectivePagePermission(
  userId: number,
  companyId: number,
  pageKey: string
): Promise<AccessLevel> {
  const pageKeyVariants = getPageKeyVariants(pageKey);

  // Step 1: SUPER_ADMIN bypass
  const userCompanyRole = await prisma.userCompanyRole.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: { role: true },
  });

  if (userCompanyRole?.role === Role.SUPER_ADMIN) {
    return AccessLevel.READ_WRITE;
  }

  // Step 2: Check override
  const override = await prisma.userPermissionOverride.findFirst({
    where: { userId, companyId, pageKey: { in: pageKeyVariants } },
    select: { accessLevel: true },
  });
  if (override) {
    return override.accessLevel as AccessLevel;
  }

  // Step 3: Check template page via assignment
  const assignment = await prisma.userPermissionAssignment.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: {
      template: {
        select: {
          pages: {
            where: { pageKey: { in: pageKeyVariants } },
            select: { accessLevel: true },
          },
        },
      },
    },
  });

  const templatePage = assignment?.template.pages[0];
  if (templatePage) {
    return templatePage.accessLevel as AccessLevel;
  }

  // Step 4: Default — no access
  return AccessLevel.NONE;
}
