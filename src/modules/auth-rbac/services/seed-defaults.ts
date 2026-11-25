import { pageRegistry } from "../registry/page-registry";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Default template definitions.
 * Each maps a template name to a function that returns the access level for a given page.
 */
interface TemplateDefinition {
  name: string;
  description: string;
  getAccessLevel: (
    pageKey: string,
    section: string
  ) => "NONE" | "READ_ONLY" | "READ_WRITE";
}

/**
 * Seed the five default permission templates for a newly created company.
 *
 * Templates created:
 * - READ_ONLY  — view all pages
 * - COMMENT    — view all pages (comment permissions are action-level, not page-level)
 * - WRITE      — full operational access, no admin access
 * - DELETE     — full operational access including deletions, no admin access
 * - ADMIN      — full access to all pages including admin
 *
 * Idempotent: if the company already has any templates, this function returns immediately.
 *
 * @param prisma    - Prisma client instance (direct or transactional)
 * @param companyId - The ID of the newly created company
 */
export async function seedDefaultTemplates(
  prisma: PrismaClient,
  companyId: number
): Promise<void> {
  // Idempotency: skip if company already has templates
  const existingCount = await prisma.permissionTemplate.count({
    where: { companyId },
  });
  if (existingCount > 0) return;

  // Get all registered pages from the registry
  const pages = pageRegistry.getPages();
  if (pages.length === 0) return; // No pages registered yet — nothing to seed

  // Define the 5 default templates
  const templates: TemplateDefinition[] = [
    {
      name: "READ_ONLY",
      description:
        "View all pages. Cannot create, edit, or delete any records.",
      getAccessLevel: () => "READ_ONLY",
    },
    {
      name: "COMMENT",
      description:
        "View all pages and add comments. Cannot create, edit, or delete records.",
      getAccessLevel: () => "READ_ONLY",
    },
    {
      name: "WRITE",
      description:
        "Full read/write access to operational pages. No access to admin pages.",
      getAccessLevel: (pageKey) =>
        pageKey.startsWith("manage-system") ? "NONE" : "READ_WRITE",
    },
    {
      name: "DELETE",
      description:
        "Full read/write access to operational pages including deletions. No access to admin pages.",
      getAccessLevel: (pageKey) =>
        pageKey.startsWith("manage-system") ? "NONE" : "READ_WRITE",
    },
    {
      name: "ADMIN",
      description: "Full read/write access to all pages including admin.",
      getAccessLevel: () => "READ_WRITE",
    },
  ];

  // Create all 5 templates with their pages in a transaction
  await prisma.$transaction(async (tx) => {
    for (const templateDef of templates) {
      const template = await tx.permissionTemplate.create({
        data: {
          companyId,
          name: templateDef.name,
          description: templateDef.description,
          isDefault: true,
        },
      });

      // Create page entries for this template
      await tx.permissionTemplatePage.createMany({
        data: pages.map((page) => ({
          templateId: template.id,
          pageKey: page.pageKey,
          accessLevel: templateDef.getAccessLevel(page.pageKey, page.section),
        })),
      });
    }
  });
}
