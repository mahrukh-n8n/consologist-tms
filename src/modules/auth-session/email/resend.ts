/**
 * auth-session module — email gatekeeper
 *
 * Sends transactional email via the Resend SDK.
 * Env vars validated at call time (not import time) so the module
 * remains importable in environments where Resend is not configured.
 */

import { Resend } from "resend";

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

/**
 * Sends an email via Resend.
 * Throws if RESEND_API_KEY or RESEND_FROM_EMAIL env vars are missing.
 * Throws if the Resend API returns an error.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY environment variable is required");
  }
  if (!from) {
    throw new Error("RESEND_FROM_EMAIL environment variable is required");
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    attachments: input.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
    })),
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}
