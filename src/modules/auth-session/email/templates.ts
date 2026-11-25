/**
 * auth-session module — email templates
 *
 * Plain functional HTML emails for auth flows.
 * All templates accept appName and appUrl so they work in any app.
 */

import { sendEmail } from "./resend";

// ─── Shared helpers ──────────────────────────────────────────

function baseLayout(appName: string, title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #e5e7eb;">
              <span style="font-size:20px;font-weight:700;color:#111827;">${appName}</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                This email was sent by ${appName}. If you did not request this, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:4px;font-size:14px;font-weight:600;margin:20px 0;">${label}</a>`;
}

// ─── Password Reset ──────────────────────────────────────────

export async function sendPasswordResetEmail(input: {
  to: string;
  resetUrl: string;
  appName: string;
  appUrl: string;
}): Promise<void> {
  const body = `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111827;">Reset your password</h1>
    <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">
      We received a request to reset your password for your ${input.appName} account.
      Click the button below to choose a new password.
    </p>
    <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">This link expires in 24 hours.</p>
    ${ctaButton("Reset Password", input.resetUrl)}
    <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">
      If the button above doesn't work, copy and paste this URL into your browser:<br/>
      <a href="${input.resetUrl}" style="color:#2563eb;word-break:break-all;">${input.resetUrl}</a>
    </p>
  `;

  await sendEmail({
    to: input.to,
    subject: `Reset your ${input.appName} password`,
    html: baseLayout(input.appName, `Reset your ${input.appName} password`, body),
  });
}

// ─── Invitation ──────────────────────────────────────────────

export async function sendInvitationEmail(input: {
  to: string;
  inviteUrl: string;
  inviterName: string;
  appName: string;
  appUrl: string;
}): Promise<void> {
  const body = `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111827;">You've been invited</h1>
    <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">
      <strong>${input.inviterName}</strong> has invited you to join them on ${input.appName}.
      Click the button below to accept and set up your account.
    </p>
    <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">This invitation expires in 24 hours.</p>
    ${ctaButton("Accept Invitation", input.inviteUrl)}
    <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">
      If the button above doesn't work, copy and paste this URL into your browser:<br/>
      <a href="${input.inviteUrl}" style="color:#2563eb;word-break:break-all;">${input.inviteUrl}</a>
    </p>
  `;

  await sendEmail({
    to: input.to,
    subject: `${input.inviterName} invited you to ${input.appName}`,
    html: baseLayout(input.appName, `You've been invited to ${input.appName}`, body),
  });
}

// ─── Welcome ─────────────────────────────────────────────────

export async function sendWelcomeEmail(input: {
  to: string;
  appName: string;
  appUrl: string;
}): Promise<void> {
  const body = `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111827;">Welcome to ${input.appName}</h1>
    <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">
      Your account has been set up and is ready to use.
      Click the button below to get started.
    </p>
    ${ctaButton("Go to Dashboard", input.appUrl)}
  `;

  await sendEmail({
    to: input.to,
    subject: `Welcome to ${input.appName}`,
    html: baseLayout(input.appName, `Welcome to ${input.appName}`, body),
  });
}

// ─── Approval Submitted (to admins) ──────────────────────────

export async function sendApprovalSubmittedEmail(input: {
  to: string;
  entityLabel: string;
  submitterName: string;
  appName: string;
  appUrl: string;
}): Promise<void> {
  const body = `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111827;">New approval request</h1>
    <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">
      <strong>${input.submitterName}</strong> submitted <strong>${input.entityLabel}</strong> for approval.
    </p>
    <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">Please review this request at your earliest convenience.</p>
    ${ctaButton("Review in App", `${input.appUrl}/admin/approval-queue`)}
  `;

  await sendEmail({
    to: input.to,
    subject: `[${input.appName}] Approval needed: ${input.entityLabel}`,
    html: baseLayout(input.appName, `Approval needed: ${input.entityLabel}`, body),
  });
}

// ─── Approval Decision (to maker) ────────────────────────────

export async function sendApprovalDecisionEmail(input: {
  to: string;
  entityLabel: string;
  decision: "approved" | "rejected";
  reviewerName: string;
  rejectionReason?: string;
  appName: string;
  appUrl: string;
}): Promise<void> {
  const isApproved = input.decision === "approved";
  const statusColor = isApproved ? "#059669" : "#dc2626";
  const statusLabel = isApproved ? "Approved" : "Rejected";

  const reasonBlock = !isApproved && input.rejectionReason
    ? `<p style="margin:12px 0 0;font-size:14px;color:#374151;line-height:1.6;padding:12px;background:#fef2f2;border-radius:4px;"><strong>Reason:</strong> ${input.rejectionReason}</p>`
    : "";

  const body = `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111827;">Your request was ${input.decision}</h1>
    <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">
      <strong>${input.reviewerName}</strong> has
      <span style="color:${statusColor};font-weight:600;">${statusLabel.toLowerCase()}</span>
      your submission: <strong>${input.entityLabel}</strong>.
    </p>
    ${reasonBlock}
    ${ctaButton("View in App", input.appUrl)}
  `;

  await sendEmail({
    to: input.to,
    subject: `[${input.appName}] ${statusLabel}: ${input.entityLabel}`,
    html: baseLayout(input.appName, `${statusLabel}: ${input.entityLabel}`, body),
  });
}

// ─── Email Verification ───────────────────────────────────────

export async function sendVerificationEmail(input: {
  to: string;
  verifyUrl: string;
  appName: string;
  appUrl: string;
}): Promise<void> {
  const body = `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111827;">Verify your email address</h1>
    <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">
      Please verify your email address to complete your ${input.appName} account setup.
    </p>
    <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">This link expires in 24 hours.</p>
    ${ctaButton("Verify Email", input.verifyUrl)}
    <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">
      If the button above doesn't work, copy and paste this URL into your browser:<br/>
      <a href="${input.verifyUrl}" style="color:#2563eb;word-break:break-all;">${input.verifyUrl}</a>
    </p>
  `;

  await sendEmail({
    to: input.to,
    subject: `Verify your ${input.appName} email`,
    html: baseLayout(input.appName, `Verify your ${input.appName} email`, body),
  });
}
