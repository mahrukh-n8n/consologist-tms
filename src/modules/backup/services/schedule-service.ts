/** Portable execution seam. Scheduling/locking belongs to the host application. */
import type { PrismaClient, BackupSchedule } from "@/generated/prisma/client";
import type { DataSourceRegistry } from "../registry/data-source-registry";
import type { StorageDestination } from "../registry/types";
import { createBackup } from "./export-service";
import { deleteBackup, type DriveUploader } from "./storage-service";

export async function runScheduledBackup(db: PrismaClient, registry: DataSourceRegistry, schedule: BackupSchedule, password: string, driveUploader: DriveUploader) {
  if (!password || password.length < 8) throw new Error("Automatic backup password is not configured.");
  const member = await db.userCompanyRole.findFirst({ where: { companyId: schedule.companyId }, orderBy: { createdAt: "asc" }, select: { userId: true } });
  if (!member) throw new Error("No company member available to attribute this backup to.");
  const destinations = schedule.storageLocations.split(",") as StorageDestination[];
  if (!destinations.includes("db") || destinations.some((d) => !["db", "filesystem", "drive"].includes(d))) throw new Error("Invalid backup destinations.");
  const result = await createBackup(db, registry, { companyId: schedule.companyId, userId: member.userId,
    password, destinations, isScheduled: true, driveUploader, requireComplete: true });
  const warnings = [...result.warnings];
  // Never prune good copies after a partial destination write.
  if (destinations.every((d) => result.storedIn.includes(d) || (d === "db" && result.storedIn.includes("filesystem")))) {
    const backups = await db.backup.findMany({
      where: { companyId: schedule.companyId, isScheduled: true, isSafetyBackup: false },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, isComplete: true },
    });
    // Keep N verified complete snapshots before discarding any older partial or
    // legacy snapshots. Once superseded, partial copies must not accumulate forever.
    const retained = backups.filter((b) => b.isComplete).slice(0, schedule.retentionCount);
    const cutoff = retained.length === schedule.retentionCount ? backups.findIndex((b) => b.id === retained.at(-1)!.id) : backups.length;
    for (const backup of backups.slice(cutoff + 1)) {
      try { await deleteBackup(db, backup.id, schedule.companyId, driveUploader); }
      catch (error) { warnings.push(`Retention: ${error instanceof Error ? error.message : "cleanup failed"}`); }
    }
  }
  return { status: warnings.length ? "PARTIAL" : "SUCCESS",
    summary: `Backup #${result.backupId}. Stored in: ${result.storedIn.join(", ")}. ${warnings.join("; ")}`.trim() };
}
