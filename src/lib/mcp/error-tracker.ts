/**
 * MCP HTTP Transport — Error Rate Tracker
 *
 * Tracks error rates for the health check endpoint.
 * Both total requests and errors are tracked per-window
 * using timestamp arrays for accurate ratio calculation.
 */

export class McpErrorTracker {
  private errors: number[] = []; // error timestamps
  private totals: number[] = []; // total request timestamps

  /**
   * Record a total request.
   */
  recordTotal(): void {
    this.totals.push(Date.now());
  }

  /**
   * Record an error.
   */
  recordError(): void {
    this.errors.push(Date.now());
  }

  /**
   * Get the error rate in the given window.
   * Returns a ratio from 0.0 to 1.0.
   */
  getErrorRate(windowMs: number): number {
    const now = Date.now();
    const cutoff = now - windowMs;

    // Prune old entries from both arrays
    this.errors = this.errors.filter((t) => t > cutoff);
    this.totals = this.totals.filter((t) => t > cutoff);

    // Calculate ratio from same window
    if (this.totals.length === 0) return 0;

    const rate = this.errors.length / this.totals.length;
    return Math.min(rate, 1.0);
  }

  /**
   * Reset all counters (for testing).
   */
  reset(): void {
    this.errors = [];
    this.totals = [];
  }
}

// Singleton instance
export const mcpErrorTracker = new McpErrorTracker();
