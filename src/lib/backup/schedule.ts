import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { dataSourceRegistry, runScheduledBackup } from "@/modules/backup";
import { isConnected } from "@/modules/google-drive";
import { createDriveUploader } from "./drive-adapter";
import { registerBackupSources } from "./register-sources";

export const scheduleSchema = z.object({
  intervalHours: z.coerce.number().int().min(1).max(168),
  retentionCount: z.coerce.number().int().min(1).max(30),
  storages: z.array(z.enum(["db", "filesystem", "drive"])).min(1),
});

export function getSchedule(db: PrismaClient, companyId: number) {
  return db.backupSchedule.findUnique({ where: { companyId } });
}

export async function upsertSchedule(
  db: PrismaClient,
  companyId: number,
  input: z.infer<typeof scheduleSchema>
) {
  if (!input.storages.includes("db")) throw new Error("Database storage is required.");
  const nextRunAt = new Date(Date.now() + input.intervalHours * 60 * 60 * 1000);
  return db.backupSchedule.upsert({
    where: { companyId },
    update: {
      intervalHours: input.intervalHours,
      retentionCount: input.retentionCount,
      storageLocations: input.storages.join(","),
      isActive: true,
      nextRunAt,
    },
    create: {
      companyId,
      intervalHours: input.intervalHours,
      retentionCount: input.retentionCount,
      storageLocations: input.storages.join(","),
      isActive: true,
      nextRunAt,
    },
  });
}

export async function pauseSchedule(db: PrismaClient, companyId: number) {
  await db.backupSchedule.updateMany({ where: { companyId }, data: { isActive: false } });
}

/** Run every due schedule. Password comes from BACKUP_SCHEDULE_PASSWORD. */
export async function runDueSchedules(db: PrismaClient, now = new Date()) {
  registerBackupSources();
  const password = process.env.BACKUP_SCHEDULE_PASSWORD;
  if (!password || password.length < 8) throw new Error("BACKUP_SCHEDULE_PASSWORD must be at least 8 characters.");
  const due = await db.backupSchedule.findMany({ where: { isActive: true, nextRunAt: { lte: now } }, take: 25 });
  const results: { companyId: number; status: string; summary?: string; error?: string }[] = [];
  for (const schedule of due) {
    try {
      const connected = await isConnected(db, schedule.companyId);
      const result = await runScheduledBackup(
        db,
        dataSourceRegistry,
        schedule,
        password,
        connected ? createDriveUploader(db) : undefined as never
      );
      results.push({ companyId: schedule.companyId, status: result.status, summary: result.summary });
    } catch (error) {
      results.push({ companyId: schedule.companyId, status: "FAILED", error: error instanceof Error ? error.message : String(error) });
    } finally {
      await db.backupSchedule.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: new Date(),
          nextRunAt: new Date(Date.now() + schedule.intervalHours * 60 * 60 * 1000),
        },
      });
    }
  }
  return results;
}
