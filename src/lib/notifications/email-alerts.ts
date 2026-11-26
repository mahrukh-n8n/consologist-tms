import type { PrismaClient } from "@/generated/prisma/client";
import { TaskStatus } from "@/generated/prisma/enums";
import {
  sendDailyDigestEmail,
  sendTaskCommentEmail,
  sendTaskDueSoonEmail,
  sendTaskMentionEmail,
  sendTaskOverdueEmail,
} from "@/lib/email/alerts";

type Db = PrismaClient;

export const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

type Assignee = { id: number; email: string; fullName: string };

async function preferences(db: Db, userId: number, companyId: number) {
  const row = await db.emailAlertPreference.findUnique({
    where: { userId_companyId: { userId, companyId } },
  });
  return {
    dueSoon: row?.dueSoon ?? true,
    overdue: row?.overdue ?? true,
    comment: row?.comment ?? true,
    mention: row?.mention ?? true,
    digest: row?.digest ?? true,
  };
}

const MAX_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = 5 * 60 * 1000;

/** Claim a dedupe key for delivery. Reclaims FAILED rows after backoff. */
async function claim(db: Db, input: {
  companyId: number;
  userId: number;
  taskId: number | null;
  kind: string;
  dedupeKey: string;
}): Promise<boolean> {
  try {
    await db.emailAlert.create({ data: { ...input, status: "PENDING" } });
    return true;
  } catch (error) {
    if (!(typeof error === "object" && error && "code" in error && error.code === "P2002")) throw error;
    const existing = await db.emailAlert.findUnique({ where: { dedupeKey: input.dedupeKey } });
    if (!existing || existing.status === "SENT" || existing.status === "PENDING") return false;
    if (existing.attempts >= MAX_ATTEMPTS) return false;
    const cutoff = new Date(Date.now() - RETRY_BACKOFF_MS * Math.max(1, existing.attempts));
    if (existing.lastAttemptAt && existing.lastAttemptAt > cutoff) return false;
    const updated = await db.emailAlert.updateMany({
      where: { id: existing.id, status: "FAILED", attempts: existing.attempts },
      data: { status: "PENDING" },
    });
    return updated.count === 1;
  }
}

async function deliver(db: Db, key: {
  companyId: number;
  userId: number;
  taskId: number | null;
  kind: string;
  dedupeKey: string;
}, send: () => Promise<void>): Promise<boolean> {
  if (!(await claim(db, key))) return false;
  try {
    await send();
    await db.emailAlert.update({
      where: { dedupeKey: key.dedupeKey },
      data: { status: "SENT", lastAttemptAt: new Date(), lastError: null, attempts: { increment: 1 } },
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Email alert ${key.kind} failed for user ${key.userId}:`, error);
    await db.emailAlert.update({
      where: { dedupeKey: key.dedupeKey },
      data: {
        status: "FAILED",
        lastError: message.slice(0, 500),
        lastAttemptAt: new Date(),
        attempts: { increment: 1 },
      },
    }).catch(() => undefined);
    return false;
  }
}

const MENTION_RE = /@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

/**
 * Comment + mention alerts. Recipients are always current assignees.
 * Mentioned assignees get the mention alert; other assignees get the comment alert.
 */
export async function notifyTaskComment(db: Db, commentId: number): Promise<void> {
  const comment = await db.comment.findUnique({
    where: { id: commentId },
    select: { id: true, itemId: true, itemType: true, userId: true, body: true },
  });
  if (!comment || comment.itemType !== "task") return;

  const task = await db.task.findUnique({
    where: { id: comment.itemId },
    select: {
      id: true,
      title: true,
      project: { select: { name: true, group: { select: { companyId: true } } } },
      assignees: { select: { user: { select: { id: true, email: true, fullName: true } } } },
    },
  });
  if (!task) return;

  const companyId = task.project.group.companyId;
  const assignees: Assignee[] = task.assignees.map((a) => a.user);
  if (assignees.length === 0) return;

  const actor = await db.user.findUnique({ where: { id: comment.userId }, select: { fullName: true } });
  const mentionedEmails = new Set(
    [...comment.body.matchAll(MENTION_RE)].map((m) => m[1]!.toLowerCase())
  );
  const mentionedAssignees = assignees.filter((u) => mentionedEmails.has(u.email.toLowerCase()));

  for (const user of mentionedAssignees) {
    if (user.id === comment.userId) continue;
    const prefs = await preferences(db, user.id, companyId);
    if (!prefs.mention) continue;
    await deliver(
      db,
      { companyId, userId: user.id, taskId: task.id, kind: "mention", dedupeKey: `mention:${commentId}:${user.id}` },
      () => sendTaskMentionEmail({
        to: user.email,
        recipientName: user.fullName,
        taskTitle: task.title,
        projectName: task.project.name,
        taskId: task.id,
        actorName: actor?.fullName,
        detail: comment.body,
      })
    );
  }

  for (const user of assignees) {
    if (user.id === comment.userId) continue;
    if (mentionedAssignees.some((m) => m.id === user.id)) continue;
    const prefs = await preferences(db, user.id, companyId);
    if (!prefs.comment) continue;
    await deliver(
      db,
      { companyId, userId: user.id, taskId: task.id, kind: "comment", dedupeKey: `comment:${commentId}:${user.id}` },
      () => sendTaskCommentEmail({
        to: user.email,
        recipientName: user.fullName,
        taskTitle: task.title,
        projectName: task.project.name,
        taskId: task.id,
        actorName: actor?.fullName,
        detail: comment.body,
      })
    );
  }
}

export type DueAlertRun = { dueSoon: number; overdue: number; scanned: number };

/** Due-soon and overdue alerts. Recipients are current assignees; dedupe prevents repeats. */
export async function runDueAlerts(db: Db, now = new Date()): Promise<DueAlertRun> {
  const soonCutoff = new Date(now.getTime() + DUE_SOON_WINDOW_MS);
  let dueSoon = 0;
  let overdue = 0;
  let scanned = 0;
  let cursorId: number | undefined;

  while (true) {
    const tasks = await db.task.findMany({
      where: {
        status: { not: TaskStatus.COMPLETED },
        dueAt: { not: null, lte: soonCutoff },
        assignees: { some: {} },
      },
      select: {
        id: true,
        title: true,
        dueAt: true,
        project: { select: { name: true, group: { select: { companyId: true } } } },
        assignees: { select: { user: { select: { id: true, email: true, fullName: true } } } },
      },
      orderBy: { id: "asc" },
      take: 200,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });
    if (tasks.length === 0) break;
    scanned += tasks.length;

    for (const task of tasks) {
      if (!task.dueAt) continue;
      const companyId = task.project.group.companyId;
      const overdueNow = task.dueAt.getTime() < now.getTime();
      const kind = overdueNow ? "overdue" : "due-soon";
      const dueKey = task.dueAt.toISOString();

      for (const { user } of task.assignees) {
        const prefs = await preferences(db, user.id, companyId);
        if (overdueNow ? !prefs.overdue : !prefs.dueSoon) continue;

        const sent = await deliver(
        db,
        { companyId, userId: user.id, taskId: task.id, kind, dedupeKey: `${kind}:${task.id}:${user.id}:${dueKey}` },
        () => overdueNow
          ? sendTaskOverdueEmail({
              to: user.email,
              recipientName: user.fullName,
              taskTitle: task.title,
              projectName: task.project.name,
              taskId: task.id,
              dueAt: task.dueAt,
            })
          : sendTaskDueSoonEmail({
              to: user.email,
              recipientName: user.fullName,
              taskTitle: task.title,
              projectName: task.project.name,
              taskId: task.id,
              dueAt: task.dueAt,
            })
      );
        if (sent) {
          if (overdueNow) overdue++;
          else dueSoon++;
        }
      }
    }

    cursorId = tasks[tasks.length - 1]!.id;
    if (tasks.length < 200) break;
  }

  return { dueSoon, overdue, scanned };
}


export type DailyDigestRun = { sent: number; skipped: number; scanned: number };

/**
 * Daily diary: one email per member per company per calendar day (UTC) with
 * overdue, due-soon and the rest of their assigned open tasks. Deduped by date.
 */
export async function runDailyDigests(db: Db, now = new Date()): Promise<DailyDigestRun> {
  const date = now.toISOString().slice(0, 10);
  const soonCutoff = new Date(now.getTime() + DUE_SOON_WINDOW_MS);
  const members = await db.userCompanyRole.findMany({
    select: {
      userId: true,
      companyId: true,
      user: { select: { email: true, fullName: true } },
      company: { select: { name: true } },
    },
  });

  let sent = 0;
  let skipped = 0;
  let scanned = 0;

  for (const member of members) {
    const prefs = await preferences(db, member.userId, member.companyId);
    if (!prefs.digest) {
      skipped += 1;
      continue;
    }

    const tasks = await db.task.findMany({
      where: {
        archivedAt: null,
        status: { not: TaskStatus.COMPLETED },
        assignees: { some: { userId: member.userId } },
        project: { group: { companyId: member.companyId } },
        list: { archived: false },
      },
      select: { id: true, title: true, dueAt: true, project: { select: { name: true } } },
      orderBy: { dueAt: "asc" },
      take: 200,
    });
    scanned += tasks.length;
    if (tasks.length === 0) {
      skipped += 1;
      continue;
    }

    const overdue: { title: string; projectName: string; dueAt: Date | null }[] = [];
    const dueSoon: { title: string; projectName: string; dueAt: Date | null }[] = [];
    const assigned: { title: string; projectName: string; dueAt: Date | null }[] = [];
    for (const task of tasks) {
      const row = { title: task.title, projectName: task.project.name, dueAt: task.dueAt };
      if (task.dueAt && task.dueAt.getTime() < now.getTime()) overdue.push(row);
      else if (task.dueAt && task.dueAt.getTime() <= soonCutoff.getTime()) dueSoon.push(row);
      else assigned.push(row);
    }

    const ok = await deliver(
      db,
      {
        companyId: member.companyId,
        userId: member.userId,
        taskId: null,
        kind: "daily-digest",
        dedupeKey: `daily-digest:${member.companyId}:${member.userId}:${date}`,
      },
      () =>
        sendDailyDigestEmail({
          to: member.user.email,
          recipientName: member.user.fullName ?? member.user.email,
          companyName: member.company.name,
          overdue: overdue.slice(0, 20),
          dueSoon: dueSoon.slice(0, 20),
          assigned: assigned.slice(0, 20),
          total: tasks.length,
          date,
        })
    );
    if (ok) sent += 1;
    else skipped += 1;
  }

  return { sent, skipped, scanned };
}
