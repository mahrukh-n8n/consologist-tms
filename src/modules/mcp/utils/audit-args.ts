import { createHash } from "node:crypto";

/** Keep attachment identity in audit evidence, never a duplicate of its binary payload. */
export function compactAttachmentArgument(key: string, value: unknown): unknown {
  if (key !== "contentBase64" || typeof value !== "string") return value;
  const bytes = Buffer.from(value, "base64");
  return { omitted: "attachment content", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

/** Redact credentials before logging any outcome, including validation failures. */
export function serializeAuditArgs(input: unknown): string {
  return JSON.stringify(input, (key, value) =>
    /password|secret|token|authorization|api.?key/i.test(key) ? "[REDACTED]" : compactAttachmentArgument(key, value));
}
