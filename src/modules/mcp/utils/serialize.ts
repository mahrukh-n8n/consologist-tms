/**
 * MCP Module — Serialization Helpers
 *
 * Strict normalization of unsafe runtime values before they cross the
 * stdio boundary. All handler responses must pass through these helpers.
 *
 * Portable: zero imports from app business logic.
 */

/** Any value that has a toString() method (covers Decimal.js, BigInt wrappers, etc.). */
type Stringable = { toString(): string };

/** Normalize a single value that may be Decimal/BigInt/Date/null/undefined. */
export function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  // Decimal.js and similar: has toString() and is not a plain primitive/object/array
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    "toString" in value &&
    typeof (value as Stringable).toString === "function" &&
    !(value instanceof Date)
  ) {
    // Distinguish Decimal-like objects: they have `d`, `e`, `s` internal fields (Decimal.js)
    // or a custom constructor name that is not Object/Array/Map/Set.
    const ctorName = (value as object).constructor?.name;
    if (ctorName && ctorName !== "Object" && ctorName !== "Array") {
      return (value as Stringable).toString();
    }
  }
  return value;
}

/**
 * Deep-serialize a plain object or array, normalizing all unsafe values.
 * Safe to call on Prisma model return values before sending over stdio.
 */
export function serializeDeep(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return value;

  if (seen.has(value as object)) {
    return "[Circular]";
  }

  if (Array.isArray(value)) {
    seen.add(value);
    const serialized = value.map((entry) => serializeDeep(entry, seen));
    seen.delete(value);
    return serialized;
  }

  if (value instanceof Set) {
    seen.add(value);
    const serialized = Array.from(value, (entry) => serializeDeep(entry, seen));
    seen.delete(value);
    return serialized;
  }

  if (value instanceof Map) {
    seen.add(value);
    const serialized: Record<string, unknown> = {};
    for (const [key, entry] of value.entries()) {
      serialized[String(key)] = serializeDeep(entry, seen);
    }
    seen.delete(value);
    return serialized;
  }

  const ctorName = (value as object).constructor?.name;
  if (
    ctorName &&
    ctorName !== "Object" &&
    ctorName !== "Array" &&
    ctorName !== "Map" &&
    ctorName !== "Set" &&
    ctorName !== "Date" &&
    ctorName !== "RegExp"
  ) {
    return (value as Stringable).toString();
  }

  seen.add(value as object);
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    result[k] = serializeDeep(v, seen);
  }
  seen.delete(value as object);
  return result;
}

/**
 * Shape a successful data result for the MCP envelope.
 * Serializes the payload deeply before returning.
 */
export function dataResult(payload: unknown): import("../types").McpToolResult {
  return {
    ok: true,
    kind: "data",
    payload: serializeDeep(payload),
  };
}

/**
 * Shape a selection/context result (get_create_context family).
 */
export function selectionResult(
  payload: unknown,
  options?: {
    choices?: import("../types").McpToolResult["choices"];
    requirements?: import("../types").McpToolResult["requirements"];
    next?: import("../types").McpToolResult["next"];
  }
): import("../types").McpToolResult {
  return {
    ok: true,
    kind: "selection",
    payload: serializeDeep(payload),
    ...options,
  };
}

/**
 * Shape a resolution result (resolve_* family).
 */
export function resolutionResult(
  derived: Record<string, unknown>,
  options?: {
    choices?: import("../types").McpToolResult["choices"];
    warnings?: import("../types").McpToolResult["warnings"];
    blockers?: import("../types").McpToolResult["blockers"];
    next?: import("../types").McpToolResult["next"];
  }
): import("../types").McpToolResult {
  return {
    ok: options?.blockers && options.blockers.length > 0 ? false : true,
    kind: options?.blockers && options.blockers.length > 0 ? "blocked" : "resolution",
    derived: serializeDeep(derived) as Record<string, unknown>,
    ...options,
  };
}

/**
 * Shape a preview result (preview_* family).
 */
export function previewResult(
  derived: Record<string, unknown>,
  options?: {
    warnings?: import("../types").McpToolResult["warnings"];
    blockers?: import("../types").McpToolResult["blockers"];
    next?: import("../types").McpToolResult["next"];
  }
): import("../types").McpToolResult {
  return {
    ok: options?.blockers && options.blockers.length > 0 ? false : true,
    kind: options?.blockers && options.blockers.length > 0 ? "blocked" : "preview",
    derived: serializeDeep(derived) as Record<string, unknown>,
    ...options,
  };
}

/**
 * Shape an immediate-commit success result.
 */
export function commitResult(payload: unknown): import("../types").McpToolResult {
  return {
    ok: true,
    kind: "commit",
    payload: serializeDeep(payload),
  };
}

/**
 * Shape a pending-approval commit result.
 */
export function approvalResult(pendingApprovalId: number): import("../types").McpToolResult {
  return {
    ok: true,
    kind: "commit",
    payload: {
      approvalRequired: true,
      pendingApprovalId,
    },
    next: [
      {
        tool: "admin.approvalQueue",
        description: "Review the pending approval in /admin/approval-queue",
      },
    ],
  };
}

/**
 * Shape a blocked result (hard blocker — no commit path).
 */
export function blockedResult(
  blockers: import("../types").McpBlocker[]
): import("../types").McpToolResult {
  return {
    ok: false,
    kind: "blocked",
    blockers,
  };
}

/**
 * Shape an error result.
 */
export function errorResult(
  error: string,
  errorCode: import("../types").McpErrorCode
): import("../types").McpToolResult {
  return {
    ok: false,
    kind: "data",
    error,
    errorCode,
  };
}
