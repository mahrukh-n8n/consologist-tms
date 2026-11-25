import type { PrismaClient } from "@/generated/prisma/client";
import { pageRegistry } from "../registry/page-registry";
import { recordPermissionChange } from "./audit-service";
import { PermissionAuditActionType } from "../types/audit-types";
// ---------------------------------------------------------------------------
// Input / Output Types
// ---------------------------------------------------------------------------

export interface CreateTemplateInput {
  companyId: number;
  userId: number; // actor performing the action (for audit)
  name: string;
  description?: string;
  pages: { pageKey: string; accessLevel: string; requiresApproval?: boolean }[];
}

export interface UpdateTemplateInput {
  templateId: number;
  companyId: number;
  userId: number; // actor performing the action (for audit)
  name?: string;
  description?: string;
  pages?: { pageKey: string; accessLevel: string; requiresApproval?: boolean }[];
}

export interface CloneTemplateInput {
  templateId: number;
  companyId: number;
  userId: number; // actor performing the action (for audit)
  newName?: string;
}

export interface DeleteTemplateInput {
  templateId: number;
  companyId: number;
  userId: number; // actor performing the action (for audit)
}

export interface TemplateWithCount {
  id: number;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: { assignments: number };
}

export interface TemplateWithPages {
  id: number;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  pages: { id: number; pageKey: string; accessLevel: string; requiresApproval: boolean }[];
  _count: { assignments: number };
}

// ---------------------------------------------------------------------------
// Private Helpers
// ---------------------------------------------------------------------------

/** Snapshot a template's pages for audit state, including requiresApproval. */
function snapshotPages(
  pages: { pageKey: string; accessLevel: string; requiresApproval?: boolean }[]
): Record<string, { accessLevel: string; requiresApproval: boolean }> {
  const snapshot: Record<string, { accessLevel: string; requiresApproval: boolean }> = {};
  for (const p of pages) {
    snapshot[p.pageKey] = {
      accessLevel: p.accessLevel,
      requiresApproval: p.requiresApproval ?? false,
    };
  }
  return snapshot;
}

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

const VALID_ACCESS_LEVELS = new Set(["NONE", "READ_ONLY", "READ_WRITE"]);

function validatePages(
  pages: { pageKey: string; accessLevel: string; requiresApproval?: boolean }[]
): void {
  for (const page of pages) {
    if (!pageRegistry.hasPage(page.pageKey)) {
      throw new Error(`Invalid page key: ${page.pageKey}`);
    }
    if (!VALID_ACCESS_LEVELS.has(page.accessLevel)) {
      throw new Error(`Invalid access level: ${page.accessLevel}`);
    }
    if (page.requiresApproval === true) {
      if (page.accessLevel !== "READ_WRITE") {
        throw new Error(
          `Requires Approval can only be enabled for pages with READ_WRITE access level.`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Mutation Functions (receive a Prisma transaction client)
// ---------------------------------------------------------------------------

/**
 * Create a new permission template with the given pages.
 *
 * Validates:
 * - Name is not empty
 * - Name is unique per company
 * - All pageKeys exist in the page registry
 * - All accessLevel values are valid
 */
export async function createTemplate(
  tx: PrismaClient,
  input: CreateTemplateInput
): Promise<TemplateWithPages> {
  const { companyId, userId, name, description, pages } = input;

  if (!name || !name.trim()) {
    throw new Error("Template name is required");
  }

  // Check name uniqueness
  const existing = await tx.permissionTemplate.findFirst({
    where: { companyId, name: name.trim() },
    select: { id: true },
  });
  if (existing) {
    throw new Error("A template with this name already exists");
  }

  // Validate pages
  validatePages(pages);

  // Create template
  const template = await tx.permissionTemplate.create({
    data: {
      companyId,
      name: name.trim(),
      description: description ?? null,
      pages: {
        create: pages.map((p) => ({
          pageKey: p.pageKey,
          accessLevel: p.accessLevel as "NONE" | "READ_ONLY" | "READ_WRITE",
          requiresApproval: p.requiresApproval ?? false,
        })),
      },
    },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      pages: { select: { id: true, pageKey: true, accessLevel: true, requiresApproval: true } },
      _count: { select: { assignments: true } },
    },
  });

  // Record audit entry
  await recordPermissionChange(tx, {
    companyId,
    actorId: userId,
    targetUserId: null,
    actionType: PermissionAuditActionType.TEMPLATE_CREATED,
    beforeState: null,
    afterState: {
      templateId: template.id,
      templateName: template.name,
      pages: snapshotPages(template.pages),
    },
  });

  return template;
}

/**
 * Update an existing template's name, description, and/or pages.
 *
 * Pages use a full-replace strategy: all existing pages are deleted and
 * replaced with the provided set.
 */
export async function updateTemplate(
  tx: PrismaClient,
  input: UpdateTemplateInput
): Promise<TemplateWithPages> {
  const { templateId, companyId, userId, name, description, pages } = input;

  // Fetch existing template (with pages for before-state snapshot)
  const existing = await tx.permissionTemplate.findFirst({
    where: { id: templateId, companyId },
    select: { id: true, name: true, pages: { select: { pageKey: true, accessLevel: true, requiresApproval: true } } },
  });
  if (!existing) {
    throw new Error("Template not found");
  }

  // Check name uniqueness (only if name is changing)
  if (name !== undefined && name.trim() !== existing.name) {
    if (!name.trim()) {
      throw new Error("Template name is required");
    }
    const collision = await tx.permissionTemplate.findFirst({
      where: { companyId, name: name.trim(), id: { not: templateId } },
      select: { id: true },
    });
    if (collision) {
      throw new Error("A template with this name already exists");
    }
  }

  // Validate pages if provided
  if (pages !== undefined) {
    validatePages(pages);
  }

  // Full-replace pages if provided
  if (pages !== undefined) {
    await tx.permissionTemplatePage.deleteMany({ where: { templateId } });
    await tx.permissionTemplatePage.createMany({
      data: pages.map((p) => ({
        templateId,
        pageKey: p.pageKey,
        accessLevel: p.accessLevel as "NONE" | "READ_ONLY" | "READ_WRITE",
        requiresApproval: p.requiresApproval ?? false,
      })),
    });
  }

  // Update template fields
  const updated = await tx.permissionTemplate.update({
    where: { id: templateId },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description } : {}),
    },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      pages: { select: { id: true, pageKey: true, accessLevel: true, requiresApproval: true } },
      _count: { select: { assignments: true } },
    },
  });

  // Record audit entry
  await recordPermissionChange(tx, {
    companyId,
    actorId: userId,
    targetUserId: null,
    actionType: PermissionAuditActionType.TEMPLATE_EDITED,
    beforeState: {
      templateId: existing.id,
      templateName: existing.name,
      pages: snapshotPages(existing.pages),
    },
    afterState: {
      templateId: updated.id,
      templateName: updated.name,
      pages: snapshotPages(updated.pages),
    },
  });

  return updated;
}

/**
 * Clone an existing template. The clone name defaults to "{originalName} (Copy)".
 * If that name is already taken, appends " (2)", " (3)", etc.
 */
export async function cloneTemplate(
  tx: PrismaClient,
  input: CloneTemplateInput
): Promise<TemplateWithPages> {
  const { templateId, companyId, userId, newName } = input;

  // Fetch source template with pages
  const source = await tx.permissionTemplate.findFirst({
    where: { id: templateId, companyId },
    select: {
      id: true,
      name: true,
      description: true,
      pages: { select: { pageKey: true, accessLevel: true, requiresApproval: true } },
    },
  });
  if (!source) {
    throw new Error("Template not found");
  }

  // Determine clone name — resolve collisions
  const baseName = newName ?? `${source.name} (Copy)`;
  let cloneName = baseName;
  let suffix = 2;

  while (true) {
    const collision = await tx.permissionTemplate.findFirst({
      where: { companyId, name: cloneName },
      select: { id: true },
    });
    if (!collision) break;
    cloneName = `${baseName} (${suffix})`;
    suffix++;
  }

  // Create cloned template
  const clone = await tx.permissionTemplate.create({
    data: {
      companyId,
      name: cloneName,
      description: source.description,
      pages: {
        create: source.pages.map((p) => ({
          pageKey: p.pageKey,
          accessLevel: p.accessLevel,
          requiresApproval: p.requiresApproval,
        })),
      },
    },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      pages: { select: { id: true, pageKey: true, accessLevel: true, requiresApproval: true } },
      _count: { select: { assignments: true } },
    },
  });

  // Record audit entry
  await recordPermissionChange(tx, {
    companyId,
    actorId: userId,
    targetUserId: null,
    actionType: PermissionAuditActionType.TEMPLATE_CLONED,
    beforeState: {
      sourceTemplateId: source.id,
      sourceTemplateName: source.name,
    },
    afterState: {
      templateId: clone.id,
      templateName: clone.name,
      pages: snapshotPages(clone.pages),
    },
  });

  return clone;
}

/**
 * Delete a permission template.
 *
 * Throws if any UserPermissionAssignment references this template —
 * closed-loop guard to prevent orphaned assignments.
 */
export async function deleteTemplate(
  tx: PrismaClient,
  input: DeleteTemplateInput
): Promise<void> {
  const { templateId, companyId, userId } = input;

  // Fetch template (with pages for before-state snapshot)
  const template = await tx.permissionTemplate.findFirst({
    where: { id: templateId, companyId },
    select: { id: true, name: true, pages: { select: { pageKey: true, accessLevel: true, requiresApproval: true } } },
  });
  if (!template) {
    throw new Error("Template not found");
  }

  // Check for active assignments
  const assignmentCount = await tx.userPermissionAssignment.count({
    where: { templateId },
  });
  if (assignmentCount > 0) {
    throw new Error(
      `Cannot delete template "${template.name}": ${assignmentCount} user(s) are currently assigned to it`
    );
  }

  // Record audit entry BEFORE deletion (captures the before-state)
  await recordPermissionChange(tx, {
    companyId,
    actorId: userId,
    targetUserId: null,
    actionType: PermissionAuditActionType.TEMPLATE_DELETED,
    beforeState: {
      templateId: template.id,
      templateName: template.name,
      pages: snapshotPages(template.pages),
    },
    afterState: null,
  });

  // Delete pages (cascade handles this, but explicit for clarity)
  await tx.permissionTemplatePage.deleteMany({ where: { templateId } });

  // Delete template
  await tx.permissionTemplate.delete({ where: { id: templateId } });
}

// ---------------------------------------------------------------------------
// Query Functions (receive a plain Prisma client — NOT a transaction)
// ---------------------------------------------------------------------------

/**
 * Fetch all permission templates for a company, with user assignment counts.
 * Ordered by name ascending.
 */
export async function getTemplates(
  prisma: PrismaClient,
  companyId: number
): Promise<TemplateWithCount[]> {
  const templates = await prisma.permissionTemplate.findMany({
    where: { companyId },
    select: {
      id: true,
      name: true,
      description: true,
      isDefault: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { assignments: true } },
    },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });

  return templates;
}

/**
 * Fetch a single permission template by ID, with pages and assignment count.
 * Returns null if not found — caller decides how to handle.
 */
export async function getTemplateById(
  prisma: PrismaClient,
  templateId: number,
  companyId: number
): Promise<TemplateWithPages | null> {
  const template = await prisma.permissionTemplate.findFirst({
    where: { id: templateId, companyId },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      pages: { select: { id: true, pageKey: true, accessLevel: true, requiresApproval: true } },
      _count: { select: { assignments: true } },
    },
  });

  return template;
}
