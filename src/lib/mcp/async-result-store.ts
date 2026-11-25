/**
 * MCP Async Result Store
 *
 * In-memory store for pending/completed async tool executions.
 * When a tool takes longer than the configured timeout, it returns
 * a `pending` response with a `toolCallId` that the client can poll.
 *
 * Each entry has an AbortController so cancellation can signal
 * the background execution (if the tool handler supports it).
 *
 * Singleton instance: `asyncResultStore`
 */

import { randomUUID } from "crypto";

export type AsyncResultEntry = {
  toolCallId: string;
  userId: number;
  companyId: number;
  toolName: string;
  status: "pending" | "completed" | "failed" | "cancelled";
  result?: unknown;
  error?: string;
  createdAt: number;
  updatedAt: number;
  abortController: AbortController;
};

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CLEANUP_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export class AsyncResultStore {
  private store = new Map<string, AsyncResultEntry>();
  private readonly ttlMs: number;
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
    this.cleanupInterval = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    if (typeof this.cleanupInterval.unref === "function") {
      this.cleanupInterval.unref();
    }
  }

  createEntry(userId: number, companyId: number, toolName: string): AsyncResultEntry {
    const toolCallId = randomUUID();
    const now = Date.now();
    const entry: AsyncResultEntry = {
      toolCallId,
      userId,
      companyId,
      toolName,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      abortController: new AbortController(),
    };
    this.store.set(toolCallId, entry);
    return entry;
  }

  get(toolCallId: string): AsyncResultEntry | undefined {
    const entry = this.store.get(toolCallId);
    if (!entry) return undefined;

    // Check expiry — use updatedAt for completed/failed, createdAt for pending
    const ageMs = entry.status === "pending"
      ? Date.now() - entry.createdAt
      : Date.now() - entry.updatedAt;
    if (ageMs > this.ttlMs) {
      this.store.delete(toolCallId);
      return undefined;
    }

    return entry;
  }

  setCompleted(toolCallId: string, result: unknown): void {
    const entry = this.store.get(toolCallId);
    if (!entry) return;

    // Do not overwrite cancelled/failed entries
    if (entry.status === "cancelled") return;

    entry.status = "completed";
    entry.result = result;
    entry.updatedAt = Date.now();
  }

  setFailed(toolCallId: string, error: string): void {
    const entry = this.store.get(toolCallId);
    if (!entry) return;

    // Do not overwrite cancelled entries
    if (entry.status === "cancelled") return;

    entry.status = "failed";
    entry.error = error;
    entry.updatedAt = Date.now();
  }

  getAllPending(): AsyncResultEntry[] {
    const now = Date.now();
    const entries: AsyncResultEntry[] = [];

    for (const entry of this.store.values()) {
      const ageMs = entry.status === "pending"
        ? now - entry.createdAt
        : now - entry.updatedAt;
      if (ageMs > this.ttlMs) {
        this.store.delete(entry.toolCallId);
        continue;
      }
      if (entry.status === "pending") {
        entries.push(entry);
      }
    }

    return entries;
  }

  cancel(toolCallId: string): boolean {
    const entry = this.store.get(toolCallId);
    if (!entry || entry.status !== "pending") return false;

    // Signal abort to any handler listening on the signal
    entry.abortController.abort("Cancelled by client");

    entry.status = "cancelled";
    entry.error = "Cancelled by client";
    entry.updatedAt = Date.now();
    return true;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [toolCallId, entry] of this.store.entries()) {
      const ageMs = entry.status === "pending"
        ? now - entry.createdAt
        : now - entry.updatedAt;
      if (ageMs > this.ttlMs) {
        // Signal abort before deleting
        entry.abortController.abort("Entry expired");
        this.store.delete(toolCallId);
      }
    }
  }
}

// Singleton instance
const ttlFromEnv = parseInt(process.env.MCP_RESULT_TTL_MS || String(DEFAULT_TTL_MS), 10);
export const asyncResultStore = new AsyncResultStore(ttlFromEnv);
