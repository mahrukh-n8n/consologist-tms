/**
 * MCP HTTP Transport — Fixed Window Rate Limiter
 *
 * Simple fixed-window counter rate limiter.
 * Counter resets at exact intervals (not sliding).
 * In-memory, per-process. Distributed deployments should use Redis.
 */

export interface FixedWindowRateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // timestamp when window resets
}

interface WindowEntry {
  count: number;
  windowStart: number;
}

export class FixedWindowRateLimiter {
  private store = new Map<string, WindowEntry>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Check if a request is allowed under the rate limit.
   * If allowed, increments the counter.
   */
  check(key: string, limit: number, windowMs: number): FixedWindowRateLimitResult {
    const now = Date.now();
    let entry = this.store.get(key);

    // Reset window if expired
    if (!entry || now - entry.windowStart >= windowMs) {
      entry = { count: 0, windowStart: now };
      this.store.set(key, entry);
    }

    const resetAt = entry.windowStart + windowMs;

    if (entry.count >= limit) {
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetAt,
      };
    }

    entry.count++;

    return {
      allowed: true,
      limit,
      remaining: limit - entry.count,
      resetAt,
    };
  }

  /**
   * Get current window info without incrementing.
   */
  peek(key: string, limit: number, windowMs: number): FixedWindowRateLimitResult {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now - entry.windowStart >= windowMs) {
      return {
        allowed: true,
        limit,
        remaining: limit,
        resetAt: now + windowMs,
      };
    }

    const resetAt = entry.windowStart + windowMs;
    return {
      allowed: entry.count < limit,
      limit,
      remaining: Math.max(0, limit - entry.count),
      resetAt,
    };
  }

  /**
   * Commit (increment counter) for a key.
   * Call this only after all peek() calls pass.
   */
  commit(key: string, limit: number, windowMs: number): void {
    const now = Date.now();
    let entry = this.store.get(key);

    if (!entry || now - entry.windowStart >= windowMs) {
      entry = { count: 0, windowStart: now };
      this.store.set(key, entry);
    }

    entry.count++;
  }

  /**
   * Reset the counter for a specific key.
   */
  reset(key: string): void {
    this.store.delete(key);
  }

  /**
   * Purge windows older than 2x windowMs.
   * Should be called periodically.
   */
  cleanup(windowMs: number): void {
    const now = Date.now();
    const cutoff = now - 2 * windowMs;

    for (const [key, entry] of this.store.entries()) {
      if (entry.windowStart < cutoff) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Start automatic cleanup every 5 minutes.
   */
  startAutoCleanup(windowMs: number): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => this.cleanup(windowMs), 5 * 60 * 1000);
    if (typeof this.cleanupTimer.unref === "function") {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop automatic cleanup.
   */
  stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Get all keys currently in the store (for debugging/testing).
   */
  getKeys(): string[] {
    return Array.from(this.store.keys());
  }

  /**
   * Clear all data (for testing).
   */
  clear(): void {
    this.store.clear();
    this.stopAutoCleanup();
  }
}

// Singleton instance
export const fixedWindowRateLimiter = new FixedWindowRateLimiter();
