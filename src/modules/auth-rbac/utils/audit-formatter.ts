import { PermissionAuditActionType } from "../types/audit-types";
import type {
  TemplateAuditState,
  CloneSourceAuditState,
  AssignmentAuditState,
  OverrideAuditState,
  McpWritesAuditState,
  PageAccessSnapshot,
} from "./audit-schemas";

export interface AuditDeltaResult {
  /** Single human-readable sentence summarizing the action */
  summary: string;
  /** List of individual field changes — empty array if no granular changes */
  changes: AuditFieldChange[];
}

export interface AuditFieldChange {
  field: string;
  before: string | null;
  after: string | null;
}

/**
 * Transforms raw audit log entries into human-readable summaries.
 *
 * Pure function — no side effects, no async, no database calls.
 * Always returns a valid AuditDeltaResult — never throws.
 */
export function formatAuditDelta(
  actionType: PermissionAuditActionType | string,
  beforeState: Record<string, unknown> | null,
  afterState: Record<string, unknown> | null
): AuditDeltaResult {
  try {
    switch (actionType) {
      case PermissionAuditActionType.TEMPLATE_CREATED:
        return formatTemplateCreated(afterState);

      case PermissionAuditActionType.TEMPLATE_EDITED:
        return formatTemplateEdited(beforeState, afterState);

      case PermissionAuditActionType.TEMPLATE_CLONED:
        return formatTemplateCloned(beforeState, afterState);

      case PermissionAuditActionType.TEMPLATE_DELETED:
        return formatTemplateDeleted(beforeState);

      case PermissionAuditActionType.TEMPLATE_ASSIGNED:
        return formatTemplateAssigned(beforeState, afterState);

      case PermissionAuditActionType.TEMPLATE_REMOVED:
        return formatTemplateRemoved(beforeState);

      case PermissionAuditActionType.OVERRIDE_ADDED:
        return formatOverrideAdded(afterState);

      case PermissionAuditActionType.OVERRIDE_REMOVED:
        return formatOverrideRemoved(beforeState);

      case PermissionAuditActionType.MCP_WRITES:
        return formatMcpWrites(beforeState, afterState);

      default:
        return {
          summary: `Permission change: ${actionType}`,
          changes: [],
        };
    }
  } catch {
    // Formatter must never throw — return a safe fallback
    return {
      summary: `Permission change: ${actionType}`,
      changes: [],
    };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function safeString(value: unknown, fallback = "unknown"): string {
  if (typeof value === "string" && value.length > 0) return value;
  return fallback;
}

function safePages(value: unknown): PageAccessSnapshot {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as unknown as PageAccessSnapshot;
  }
  return {};
}

function diffPages(
  before: PageAccessSnapshot,
  after: PageAccessSnapshot
): AuditFieldChange[] {
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: AuditFieldChange[] = [];
  for (const key of allKeys) {
    const b = before[key] ?? null;
    const a = after[key] ?? null;
    if (b !== a) {
      changes.push({ field: `Page: ${key}`, before: b, after: a });
    }
  }
  return changes;
}

// ── Formatters ─────────────────────────────────────────────────────────────

function formatTemplateCreated(
  afterState: Record<string, unknown> | null
): AuditDeltaResult {
  const state = (afterState ?? {}) as unknown as TemplateAuditState;
  const name = safeString(state.templateName);
  const pages = safePages(state.pages);
  const changes: AuditFieldChange[] = Object.entries(pages).map(
    ([key, level]) => ({
      field: key,
      before: null,
      after: safeString(level),
    })
  );
  return { summary: `Created template "${name}"`, changes };
}

function formatTemplateEdited(
  beforeState: Record<string, unknown> | null,
  afterState: Record<string, unknown> | null
): AuditDeltaResult {
  const before = (beforeState ?? {}) as unknown as TemplateAuditState;
  const after = (afterState ?? {}) as unknown as TemplateAuditState;
  const afterName = safeString(after.templateName);

  const changes: AuditFieldChange[] = [];

  // Name change
  const beforeName = safeString(before.templateName, "");
  if (beforeName !== afterName && beforeName !== "") {
    changes.push({
      field: "Template name",
      before: beforeName,
      after: afterName,
    });
  }

  // Page-level changes
  const beforePages = safePages(before.pages);
  const afterPages = safePages(after.pages);
  changes.push(...diffPages(beforePages, afterPages));

  return { summary: `Edited template "${afterName}"`, changes };
}

function formatTemplateCloned(
  beforeState: Record<string, unknown> | null,
  afterState: Record<string, unknown> | null
): AuditDeltaResult {
  const source = (beforeState ?? {}) as unknown as CloneSourceAuditState;
  const cloned = (afterState ?? {}) as unknown as TemplateAuditState;
  const sourceName = safeString(source.sourceTemplateName);
  const newName = safeString(cloned.templateName);
  const pages = safePages(cloned.pages);
  const changes: AuditFieldChange[] = Object.entries(pages).map(
    ([key, level]) => ({
      field: key,
      before: null,
      after: safeString(level),
    })
  );
  return {
    summary: `Cloned template "${sourceName}" as "${newName}"`,
    changes,
  };
}

function formatTemplateDeleted(
  beforeState: Record<string, unknown> | null
): AuditDeltaResult {
  const state = (beforeState ?? {}) as unknown as TemplateAuditState;
  const name = safeString(state.templateName);
  const pages = safePages(state.pages);
  const changes: AuditFieldChange[] = Object.entries(pages).map(
    ([key, level]) => ({
      field: key,
      before: safeString(level),
      after: null,
    })
  );
  return { summary: `Deleted template "${name}"`, changes };
}

function formatTemplateAssigned(
  beforeState: Record<string, unknown> | null,
  afterState: Record<string, unknown> | null
): AuditDeltaResult {
  const after = (afterState ?? {}) as unknown as AssignmentAuditState;
  const newName = safeString(after.templateName);

  if (beforeState === null) {
    return {
      summary: `Assigned template "${newName}" to user`,
      changes: [{ field: "Template", before: null, after: newName }],
    };
  }

  const before = beforeState as unknown as AssignmentAuditState;
  const oldName = safeString(before.templateName);
  return {
    summary: `Changed template from "${oldName}" to "${newName}"`,
    changes: [{ field: "Template", before: oldName, after: newName }],
  };
}

function formatTemplateRemoved(
  beforeState: Record<string, unknown> | null
): AuditDeltaResult {
  const state = (beforeState ?? {}) as unknown as AssignmentAuditState;
  const name = safeString(state.templateName);
  return {
    summary: `Removed template "${name}" from user`,
    changes: [{ field: "Template", before: name, after: null }],
  };
}

function formatOverrideAdded(
  afterState: Record<string, unknown> | null
): AuditDeltaResult {
  const state = (afterState ?? {}) as unknown as OverrideAuditState;
  const pageKey = safeString(state.pageKey);
  const previousLevel = state.previousLevel ?? null;
  const newLevel = state.newLevel ?? null;
  return {
    summary: `Added override for page "${pageKey}"`,
    changes: [
      {
        field: `Page: ${pageKey}`,
        before: previousLevel,
        after: newLevel,
      },
    ],
  };
}

function formatOverrideRemoved(
  beforeState: Record<string, unknown> | null
): AuditDeltaResult {
  const state = (beforeState ?? {}) as unknown as OverrideAuditState;
  const pageKey = safeString(state.pageKey);
  const overrideLevel = state.overrideLevel ?? null;
  const revertedToLevel = state.revertedToLevel ?? null;
  return {
    summary: `Removed override for page "${pageKey}"`,
    changes: [
      {
        field: `Page: ${pageKey}`,
        before: overrideLevel,
        after: revertedToLevel,
      },
    ],
  };
}

function formatMcpWrites(
  beforeState: Record<string, unknown> | null,
  afterState: Record<string, unknown> | null
): AuditDeltaResult {
  const before = (beforeState ?? {}) as unknown as McpWritesAuditState;
  const after = (afterState ?? {}) as unknown as McpWritesAuditState;
  const beforeValue = before.enabled ? "Enabled" : "Disabled";
  const afterValue = after.enabled ? "Enabled" : "Disabled";

  return {
    summary: `Changed MCP writes from "${beforeValue}" to "${afterValue}"`,
    changes: [
      {
        field: "MCP writes",
        before: beforeValue,
        after: afterValue,
      },
    ],
  };
}
