/**
 * MCP protocol version negotiation.
 *
 * The server echoes the client's requested version when it is supported and
 * otherwise falls back to its latest supported version. Hardcoding a single
 * version breaks clients that negotiate a newer revision.
 */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export type SupportedProtocolVersion = (typeof SUPPORTED_PROTOCOL_VERSIONS)[number];

export function negotiateProtocolVersion(requested: unknown): SupportedProtocolVersion {
  if (typeof requested === "string" && (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)) {
    return requested as SupportedProtocolVersion;
  }
  return SUPPORTED_PROTOCOL_VERSIONS[0];
}
