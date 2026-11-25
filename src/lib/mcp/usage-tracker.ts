/**
 * MCP HTTP Transport — Usage Tracker
 *
 * In-memory tracker that records request counts per API key per window.
 * Used by the rate limiter and exposed to the Settings UI for usage display.
 */

export interface McpUsageEntry {
  count: number;
  windowStart: number;
  limit: number;
}

export class McpUsageTracker {
  private store = new Map<string, McpUsageEntry>();

  /**
   * Record a request for the given API key.
   */
  record(apiKeyId: string, limit: number, windowMs: number): void {
    const now = Date.now();
    let entry = this.store.get(apiKeyId);

    // Reset window if expired
    if (!entry || now - entry.windowStart >= windowMs) {
      entry = { count: 0, windowStart: now, limit };
      this.store.set(apiKeyId, entry);
    }

    entry.count++;
    entry.limit = limit;
  }

  /**
   * Get usage for a specific API key.
   */
  getUsage(apiKeyId: string): McpUsageEntry | null {
    const entry = this.store.get(apiKeyId);
    if (!entry) return null;

    // Check if window is still valid
    if (Date.now() - entry.windowStart >= (process.env.MCP_RATE_WINDOW_MS ? parseInt(process.env.MCP_RATE_WINDOW_MS, 10) : 10 * 60 * 1000)) {
      return { count: 0, windowStart: Date.now(), limit: entry.limit };
    }

    return { ...entry };
  }

  /**
   * Get usage for all API keys.
   */
  getAllUsage(): Map<string, McpUsageEntry> {
    const result = new Map<string, McpUsageEntry>();
    const windowMs = process.env.MCP_RATE_WINDOW_MS ? parseInt(process.env.MCP_RATE_WINDOW_MS, 10) : 10 * 60 * 1000;
    const now = Date.now();

    for (const [key, entry] of this.store.entries()) {
      if (now - entry.windowStart >= windowMs) {
        // Window expired, treat as zero
        result.set(key, { count: 0, windowStart: now, limit: entry.limit });
      } else {
        result.set(key, { ...entry });
      }
    }

    return result;
  }

  /**
   * Clear all data (for testing).
   */
  clear(): void {
    this.store.clear();
  }
}

// Singleton instance
export const mcpUsageTracker = new McpUsageTracker();
