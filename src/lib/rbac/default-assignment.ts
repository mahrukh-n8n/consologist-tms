import type { PrismaClient } from "@/generated/prisma/client";
import { registerAppPages } from "@/lib/auth/page-definitions";
import { seedDefaultTemplates } from "@/modules/auth-rbac/services/seed-defaults";
import { assignTemplate } from "@/modules/auth-rbac/services/assignment-service";
import { Role } from "@/generated/prisma/enums";

type Db = PrismaClient;

const ROLE_TEMPLATE: Record<Role, string> = {
  [Role.READ_ONLY]: "READ_ONLY",
  [Role.COMMENT]: "COMMENT",
  [Role.WRITE]: "WRITE",
  [Role.DELETE]: "DELETE",
  [Role.ADMIN]: "ADMIN",
  [Role.SUPER_ADMIN]: "ADMIN",
};

export async function ensureDefaultTemplates(db: Db, companyId: number): Promise<void> {
  registerAppPages();
  await seedDefaultTemplates(db, companyId);
}

/** Assign the template matching the member's role. Idempotent. */
export async function assignRoleTemplate(
  db: Db,
  input: { userId: number; companyId: number; role: Role; assignedBy: number }
): Promise<void> {
  await ensureDefaultTemplates(db, input.companyId);
  const name = ROLE_TEMPLATE[input.role];
  const template = await db.permissionTemplate.findFirst({
    where: { companyId: input.companyId, name },
    select: { id: true },
  });
  if (!template) throw new Error(`Default permission template "${name}" is missing.`);
  await assignTemplate(db, {
    userId: input.userId,
    companyId: input.companyId,
    templateId: template.id,
    assignedBy: input.assignedBy,
  });
}
