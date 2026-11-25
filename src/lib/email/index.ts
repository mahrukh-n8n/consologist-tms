/**
 * Canonical email entry for Consologist TMS.
 * The implementation is the portable auth-session email module (Resend).
 */
export {
  sendEmail,
  sendPasswordResetEmail,
  sendInvitationEmail,
  sendWelcomeEmail,
  sendApprovalSubmittedEmail,
  sendApprovalDecisionEmail,
  sendVerificationEmail,
} from "@/modules/auth-session/email";
export type { EmailAttachment, SendEmailInput } from "@/modules/auth-session/email";
