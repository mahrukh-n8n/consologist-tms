import { prisma } from "@/lib/db";
import { Role } from "@/generated/prisma/client";

// ── Input / output types ──────────────────────────────────────

export interface PermissionAuditLogFilters {
  actorId?: number;
  targetUserId?: number;
  actionType?: string;
  startDate?: string; // ISO date string YYYY-MM-DD
  endDate?: string;   // ISO date string YYYY-MM-DD
}

export interface PermissionAuditLogQuery {
  companyId: number;
  role: Role;
  userId: number; // the requesting user's ID (for regular user visibility filter)
  filters?: PermissionAuditLogFilters;
  page?: number;
  pageSize?: number;
}

export interface PermissionAuditLogEntry {
  id: number;
  companyId: number;
  actorId: number;
  targetUserId: number | null;
  actionType: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  createdAt: string; // ISO string for client serialization
  actor: {
    id: number;
    fullName: string;
    email: string;
  };
  targetUser: {
    id: number;
    fullName: string;
    email: string;
  } | null;
  company?: {
    id: number;
    name: string;
  };
}

export interface PermissionAuditLogResult {
  entries: PermissionAuditLogEntry[];
  totalCount: number;
  totalPages: number;
  page: number;
  pageSize: number;
}

// ── Query function ────────────────────────────────────────────

/**
 * Fetch permission audit log entries with tiered visibility.
 *
 * Visibility is enforced in the WHERE clause at the database level — not
 * post-query filtering. This means users cannot see unauthorized entries
 * by manipulating pagination or filter parameters.
 *
 * Tiers:
 *   SUPER_ADMIN — no companyId filter (sees all companies)
 *   ADMIN       — companyId = own company
 *   Regular     — companyId = own company AND targetUserId = own userId
 */
export async function getPermissionAuditLog(
  query: PermissionAuditLogQuery
): Promise<PermissionAuditLogResult> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;
  const skip = (page - 1) * pageSize;

  // ── Build WHERE clause with tiered visibility ─────────────
  const where: Record<string, unknown> = {};

  // Visibility tier 1: SUPER_ADMIN — no companyId filter
  // Visibility tier 2: ADMIN — own company only
  // Visibility tier 3: Regular user — own company + own targetUserId
  if (query.role !== Role.SUPER_ADMIN) {
    where.companyId = query.companyId;
  }

  if (query.role !== Role.SUPER_ADMIN && query.role !== Role.ADMIN) {
    // Regular users: only see entries targeting themselves
    where.targetUserId = query.userId;
  }

  // ── Apply optional filters ────────────────────────────────
  const filters = query.filters ?? {};

  if (filters.actorId) {
    where.actorId = filters.actorId;
  }

  if (filters.targetUserId) {
    // For ADMIN/SUPER_ADMIN, this filters to a specific target
    // For regular users, ignore — they can only see their own entries
    if (query.role === Role.SUPER_ADMIN || query.role === Role.ADMIN) {
      where.targetUserId = filters.targetUserId;
    }
  }

  if (filters.actionType) {
    where.actionType = filters.actionType;
  }

  if (filters.startDate || filters.endDate) {
    const dateFilter: Record<string, Date> = {};
    if (filters.startDate) {
      dateFilter.gte = new Date(`${filters.startDate}T00:00:00.000Z`);
    }
    if (filters.endDate) {
      dateFilter.lte = new Date(`${filters.endDate}T23:59:59.999Z`);
    }
    where.createdAt = dateFilter;
  }

  // ── Query with pagination ─────────────────────────────────
  const includeCompany = query.role === Role.SUPER_ADMIN;

  const [rawEntries, totalCount] = await Promise.all([
    prisma.permissionAuditLog.findMany({
      where,
      include: {
        actor: { select: { id: true, fullName: true, email: true } },
        targetUser: { select: { id: true, fullName: true, email: true } },
        ...(includeCompany ? { company: { select: { id: true, name: true } } } : {}),
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.permissionAuditLog.count({ where }),
  ]);

  const entries: PermissionAuditLogEntry[] = rawEntries.map((e) => {
    const entry: PermissionAuditLogEntry = {
      id: e.id,
      companyId: e.companyId,
      actorId: e.actorId,
      targetUserId: e.targetUserId,
      actionType: e.actionType,
      beforeState: e.beforeState as Record<string, unknown> | null,
      afterState: e.afterState as Record<string, unknown> | null,
      createdAt: e.createdAt.toISOString(),
      actor: {
        id: e.actor.id,
        fullName: e.actor.fullName,
        email: e.actor.email,
      },
      targetUser: e.targetUser
        ? {
            id: e.targetUser.id,
            fullName: e.targetUser.fullName,
            email: e.targetUser.email,
          }
        : null,
    };

    if (includeCompany && "company" in e && e.company) {
      const c = e.company as { id: number; name: string };
      entry.company = { id: c.id, name: c.name };
    }

    return entry;
  });

  return {
    entries,
    totalCount,
    totalPages: Math.ceil(totalCount / pageSize),
    page,
    pageSize,
  };
}
