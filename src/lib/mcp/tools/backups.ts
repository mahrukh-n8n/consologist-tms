import { z } from "zod";
import type { McpToolDefinition } from "@/lib/mcp/types";
import { getSchedule, pauseSchedule, scheduleSchema, upsertSchedule } from "@/lib/backup/schedule";
import {
  createBackupSchema,
  createWorkspaceBackup,
  deleteBackupSchema,
  deleteWorkspaceBackup,
  executeWorkspaceRestore,
  listWorkspaceBackups,
  previewRestoreSchema,
  previewWorkspaceRestore,
  registerBackupSources,
  restoreBackupSchema,
} from "@/lib/backup/backup-service";
import { commitResult, dataResult } from "@/modules/mcp/utils/serialize";

export const backupTools: McpToolDefinition[] = [
  {
    name: "backups.list",
    description: "List encrypted workspace backups with size, source count and storage locations.",
    inputSchema: createBackupSchema.partial().transform(() => ({})),
    requiredPageKey: "manage-system-backups",
    accessLevel: "READ",
    async handler(ctx) {
      registerBackupSources();
      return dataResult(await listWorkspaceBackups(ctx.db, ctx.companyId, { page: 1, limit: 50 }));
    },
  },
  {
    name: "backups.create",
    description: "Create an encrypted workspace backup. The password encrypts the file.",
    inputSchema: createBackupSchema,
    requiredPageKey: "manage-system-backups",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      registerBackupSources();
      const result = await createWorkspaceBackup(ctx.db, {
        companyId: ctx.companyId,
        userId: ctx.userId,
        password: (input as { password: string }).password,
      });
      return commitResult(result);
    },
  },
  {
    name: "backups.preview_restore",
    description: "Preview a restore: source keys, row counts, missing/extra sources and warnings.",
    inputSchema: previewRestoreSchema,
    requiredPageKey: "manage-system-backups",
    accessLevel: "READ",
    async handler(ctx, input) {
      registerBackupSources();
      const data = input as { backupId: number; password: string };
      const preview = await previewWorkspaceRestore(ctx.db, {
        companyId: ctx.companyId,
        backupId: data.backupId,
        password: data.password,
      });
      return dataResult({
        manifest: preview.manifest,
        missingSources: preview.missingSources,
        extraSources: preview.extraSources,
        warnings: preview.warnings ?? [],
      });
    },
  },
  {
    name: "backups.restore",
    description: "Full destructive restore. Requires confirm='RESTORE'. A safety backup is created first.",
    inputSchema: restoreBackupSchema,
    requiredPageKey: "manage-system-backups",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      registerBackupSources();
      const data = input as { backupId: number; password: string; confirm: "RESTORE" };
      const result = await executeWorkspaceRestore(ctx.db, {
        companyId: ctx.companyId,
        userId: ctx.userId,
        backupId: data.backupId,
        password: data.password,
      });
      return commitResult(result);
    },
  },
  {
    name: "backups.delete",
    description: "Delete one backup from the database, filesystem and Drive.",
    inputSchema: deleteBackupSchema,
    requiredPageKey: "manage-system-backups",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      registerBackupSources();
      await deleteWorkspaceBackup(ctx.db, {
        companyId: ctx.companyId,
        backupId: (input as { backupId: number }).backupId,
      });
      return commitResult({ deleted: true });
    },
  },
  {
    name: "backups.get_schedule",
    description: "Read the workspace backup schedule.",
    inputSchema: z.object({}),
    requiredPageKey: "manage-system-backups",
    accessLevel: "READ",
    async handler(ctx) {
      return dataResult({ schedule: await getSchedule(ctx.db, ctx.companyId) });
    },
  },
  {
    name: "backups.save_schedule",
    description: "Create or update the backup schedule (interval hours, retention count, storages).",
    inputSchema: scheduleSchema,
    requiredPageKey: "manage-system-backups",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      return commitResult(await upsertSchedule(ctx.db, ctx.companyId, input as never));
    },
  },
  {
    name: "backups.pause_schedule",
    description: "Pause the backup schedule.",
    inputSchema: z.object({}),
    requiredPageKey: "manage-system-backups",
    accessLevel: "WRITE",
    async handler(ctx) {
      await pauseSchedule(ctx.db, ctx.companyId);
      return commitResult({ paused: true });
    },
  },
];
