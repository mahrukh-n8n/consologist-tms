import { sendEmail } from "@/modules/auth-session/email";
import { APP_NAME, APP_URL } from "@/lib/app";

export type TaskAlertKind =
  | "due-soon"
  | "overdue"
  | "comment"
  | "mention";

type TaskAlertInput = {
  to: string;
  recipientName: string;
  taskTitle: string;
  projectName: string;
  taskId: number;
  actorName?: string;
  detail?: string;
  dueAt?: Date | null;
};

function layout(heading: string, lines: string[], cta: string, href: string) {
  return `
    <h1 style="margin:0 0 16px;font-size:22px;color:#111827;">${heading}</h1>
    ${lines.map((line) => `<p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">${line}</p>`).join("")}
    <p style="margin:20px 0;">
      <a href="${href}" style="display:inline-block;background:#2f6fe0;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">${cta}</a>
    </p>
    <p style="font-size:12px;color:#6b7280;">${APP_NAME}</p>
  `;
}

async function send(to: string, subject: string, heading: string, lines: string[], taskId: number) {
  await sendEmail({
    to,
    subject,
    html: layout(heading, lines, "Open task", `${APP_URL}/tasks/${taskId}`),
  });
}

export async function sendTaskDueSoonEmail(input: TaskAlertInput) {
  await send(
    input.to,
    `Due soon: ${input.taskTitle}`,
    "A task is due soon",
    [
      `<strong>${escapeHtml(input.taskTitle)}</strong> in ${escapeHtml(input.projectName)} is due ${input.dueAt?.toISOString().slice(0, 10) ?? "soon"}.`,
    ],
    input.taskId
  );
}

export async function sendTaskOverdueEmail(input: TaskAlertInput) {
  await send(
    input.to,
    `Overdue: ${input.taskTitle}`,
    "A task is overdue",
    [
      `<strong>${escapeHtml(input.taskTitle)}</strong> in ${escapeHtml(input.projectName)} was due ${input.dueAt?.toISOString().slice(0, 10) ?? "earlier"}.`,
    ],
    input.taskId
  );
}

export async function sendTaskCommentEmail(input: TaskAlertInput) {
  await send(
    input.to,
    `New comment: ${input.taskTitle}`,
    "A task has a new comment",
    [
      `<strong>${escapeHtml(input.actorName ?? "Someone")}</strong> commented on <strong>${escapeHtml(input.taskTitle)}</strong>.`,
      input.detail ? `<span style="color:#4b5563;">${escapeHtml(input.detail)}</span>` : "",
    ].filter(Boolean),
    input.taskId
  );
}

export async function sendTaskMentionEmail(input: TaskAlertInput) {
  await send(
    input.to,
    `You were mentioned: ${input.taskTitle}`,
    "You were mentioned",
    [
      `<strong>${escapeHtml(input.actorName ?? "Someone")}</strong> mentioned you on <strong>${escapeHtml(input.taskTitle)}</strong>.`,
      input.detail ? `<span style="color:#4b5563;">${escapeHtml(input.detail)}</span>` : "",
    ].filter(Boolean),
    input.taskId
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
