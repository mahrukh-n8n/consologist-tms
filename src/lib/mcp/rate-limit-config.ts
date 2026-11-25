/**
 * MCP HTTP Transport — Rate Limit Configuration
 *
 * Centralized configuration for all MCP HTTP rate limits.
 * Values can be overridden via environment variables.
 */

function envInt(name: string, fallback: number): number {
  const val = process.env[name];
  if (val === undefined || val === "") return fallback;
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export interface PerToolLimit {
  pattern: RegExp;
  limit: number;
}

export interface McpRateConfig {
  // Per-API-key general limit
  perKeyWindowMs: number;
  perKeyLimit: number;

  // Per-API-key global cap (hard ceiling across all tools)
  perKeyGlobalLimit: number;

  // Per-tool limits (ordered: first match wins)
  perToolLimits: PerToolLimit[];
  defaultPerToolLimit: number;

  // Global endpoint limit (all users combined)
  globalWindowMs: number;
  globalLimit: number;

  // IP-based throttling
  ipWindowMs: number;
  ipLimit: number;

  // Request size
  maxRequestBodyBytes: number;
}

/**
 * Default configuration with env var overrides.
 *
 * Environment variables:
 *   MCP_RATE_PER_KEY_LIMIT       — per-API-key requests per window (default: 1000)
 *   MCP_RATE_PER_KEY_GLOBAL      — per-API-key hard ceiling (default: 5000)
 *   MCP_RATE_AMAZON_PIPELINE_LIMIT — amazon_pipeline.* tools per window (default: 3000)
 *   MCP_RATE_REPORT_LIMIT        — report tool limit per window (default: 200)
 *   MCP_RATE_LIST_LIMIT          — list tool limit per window (default: 5000)
 *   MCP_RATE_DEFAULT             — default per-tool limit (default: 1000)
 *   MCP_RATE_GLOBAL_LIMIT        — global endpoint limit (default: 50000)
 *   MCP_RATE_IP_LIMIT             — per-IP limit (default: 10000)
 *   MCP_RATE_MAX_BODY_BYTES       — max request body size (default: 1048576 = 1MB)
 *   MCP_RATE_WINDOW_MS            — window size in ms for per-key/global/ip (default: 600000 = 10min)
 */
export const MCP_RATE_CONFIG: McpRateConfig = {
  perKeyWindowMs: envInt("MCP_RATE_WINDOW_MS", 10 * 60 * 1000),
  perKeyLimit: envInt("MCP_RATE_PER_KEY_LIMIT", 1000),
  perKeyGlobalLimit: envInt("MCP_RATE_PER_KEY_GLOBAL", 5000),

  perToolLimits: [
    {
      pattern: /^amazon_pipeline\./,
      limit: envInt("MCP_RATE_AMAZON_PIPELINE_LIMIT", 3000),
    },
    {
      pattern: /^report\./,
      limit: envInt("MCP_RATE_REPORT_LIMIT", 200),
    },
    {
      pattern: /\.list$/,
      limit: envInt("MCP_RATE_LIST_LIMIT", 5000),
    },
    {
      pattern: /.*/,
      limit: envInt("MCP_RATE_DEFAULT", 1000),
    },
  ],
  defaultPerToolLimit: envInt("MCP_RATE_DEFAULT", 1000),

  globalWindowMs: envInt("MCP_RATE_WINDOW_MS", 10 * 60 * 1000),
  globalLimit: envInt("MCP_RATE_GLOBAL_LIMIT", 50000),

  ipWindowMs: envInt("MCP_RATE_WINDOW_MS", 10 * 60 * 1000),
  ipLimit: envInt("MCP_RATE_IP_LIMIT", 10000),

  maxRequestBodyBytes: envInt("MCP_RATE_MAX_BODY_BYTES", 1 * 1024 * 1024),
};

/**
 * Get the rate limit for a specific tool name.
 * Returns the matching pattern limit or the default.
 */
export function getToolRateLimit(toolName: string): number {
  for (const { pattern, limit } of MCP_RATE_CONFIG.perToolLimits) {
    if (pattern.test(toolName)) {
      return limit;
    }
  }
  return MCP_RATE_CONFIG.defaultPerToolLimit;
}
