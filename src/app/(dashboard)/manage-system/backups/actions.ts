"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { requirePageWrite } from "@/modules/auth-rbac/middleware/page-access";
import {
  createBackupSchema,
  createWorkspaceBackup,
  deleteBackupSchema,
  deleteWorkspaceBackup,
  executeWorkspaceRestore,
  previewRestoreSchema,
  previewWorkspaceRestore,
  registerBackupSources,
  restoreBackupSchema,
} from "@/lib/backup/backup-service";

// Server actions run in separate workers; register sources at module scope.
registerBackupSources();

export type BackupActionState = { success: boolean; error?: string };

export async function createBackupAction(
  _prev: BackupActionState,
  formData: FormData
): Promise<BackupActionState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "manage-system-backups");
    const parsed = createBackupSchema.safeParse({ password: formData.get("password") });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid backup." };
    await createWorkspaceBackup(prisma, {
      companyId: company.id,
      userId: user.id,
      password: parsed.data.password,
    });
    revalidatePath("/manage-system/backups");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Backup failed." };
  }
}

export async function deleteBackupAction(formData: FormData): Promise<void> {
  const { user, company } = await requireCompany();
  await requirePageWrite(user.id, company.id, "manage-system-backups");
  const parsed = deleteBackupSchema.safeParse({ backupId: formData.get("id") });
  if (!parsed.success) throw new Error("Invalid backup id.");
  await deleteWorkspaceBackup(prisma, { companyId: company.id, backupId: parsed.data.backupId });
  revalidatePath("/manage-system/backups");
}

export type RestoreState = {
  success: boolean;
  error?: string;
  preview?: {
    sourceCount: number;
    rowCount: number;
    missingSources: string[];
    extraSources: string[];
    warnings: string[];
  };
};

export async function previewRestoreAction(
  _prev: RestoreState,
  formData: FormData
): Promise<RestoreState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "manage-system-backups");
    const parsed = previewRestoreSchema.safeParse({
      backupId: formData.get("id"),
      password: formData.get("password"),
    });
    if (!parsed.success) return { success: false, error: "Backup id and password are required." };
    const preview = await previewWorkspaceRestore(prisma, {
      companyId: company.id,
      backupId: parsed.data.backupId,
      password: parsed.data.password,
    });
    return {
      success: true,
      preview: {
        sourceCount: Object.keys(preview.manifest.sources).length,
        rowCount: Object.values(preview.manifest.sources).reduce((sum, s) => sum + s.rowCount, 0),
        missingSources: preview.missingSources,
        extraSources: preview.extraSources,
        warnings: preview.warnings ?? [],
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Restore preview failed." };
  }
}

export async function executeRestoreAction(
  _prev: RestoreState,
  formData: FormData
): Promise<RestoreState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "manage-system-backups");
    const parsed = restoreBackupSchema.safeParse({
      backupId: formData.get("id"),
      password: formData.get("password"),
      confirm: formData.get("confirm"),
    });
    if (!parsed.success) return { success: false, error: "Type RESTORE to confirm." };
    await executeWorkspaceRestore(prisma, {
      companyId: company.id,
      userId: user.id,
      backupId: parsed.data.backupId,
      password: parsed.data.password,
    });
    revalidatePath("/manage-system/backups");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Restore failed." };
  }
}

export type ScheduleState = { success: boolean; error?: string };

export async function saveScheduleAction(_prev: ScheduleState, formData: FormData): Promise<ScheduleState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "manage-system-backups");
    const storages = String(formData.get("storages") ?? "db").split(",").filter(Boolean) as ("db"|"filesystem"|"drive")[];
    const { scheduleSchema, upsertSchedule } = await import("@/lib/backup/schedule");
    const parsed = scheduleSchema.safeParse({
      intervalHours: formData.get("intervalHours"),
      retentionCount: formData.get("retentionCount"),
      storages,
    });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid schedule." };
    await upsertSchedule(prisma, company.id, parsed.data);
    revalidatePath("/manage-system/backups");
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Schedule failed." }; }
}

export async function pauseScheduleAction(): Promise<void> {
  const { user, company } = await requireCompany();
  await requirePageWrite(user.id, company.id, "manage-system-backups");
  const { pauseSchedule } = await import("@/lib/backup/schedule");
  await pauseSchedule(prisma, company.id);
  revalidatePath("/manage-system/backups");
}
