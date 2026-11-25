import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";

type Db = PrismaClient;

export const updateAlertPreferencesSchema = z.object({
  dueSoon: z.boolean().default(true),
  overdue: z.boolean().default(true),
  comment: z.boolean().default(true),
  mention: z.boolean().default(true),
});

export const ALERT_DEFAULTS = {
  dueSoon: true,
  overdue: true,
  comment: true,
  mention: true,
} as const;

export async function getAlertPreferences(db: Db, userId: number, companyId: number) {
  const row = await db.emailAlertPreference.findUnique({
    where: { userId_companyId: { userId, companyId } },
  });
  return {
    dueSoon: row?.dueSoon ?? ALERT_DEFAULTS.dueSoon,
    overdue: row?.overdue ?? ALERT_DEFAULTS.overdue,
    comment: row?.comment ?? ALERT_DEFAULTS.comment,
    mention: row?.mention ?? ALERT_DEFAULTS.mention,
  };
}

export async function updateAlertPreferences(
  db: Db,
  input: { userId: number; companyId: number } & z.infer<typeof updateAlertPreferencesSchema>
) {
  const data = {
    dueSoon: input.dueSoon,
    overdue: input.overdue,
    comment: input.comment,
    mention: input.mention,
  };
  return db.emailAlertPreference.upsert({
    where: { userId_companyId: { userId: input.userId, companyId: input.companyId } },
    update: data,
    create: { userId: input.userId, companyId: input.companyId, ...data },
  });
}
