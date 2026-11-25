/**
 * mcp module — public API (SERVER-ONLY)
 *
 * Import everything from "@/modules/mcp" — never reach into subdirectories.
 *
 * This module is portable: it has ZERO runtime imports from app business logic
 * (src/app/, src/lib/mutations/, src/components/).
 * Only generic dependencies are allowed (Prisma generated types, zod, standard library).
 *
 * ⚠️  SERVER-ONLY — Do NOT import this from "use client" components.
 * For client components, import from "@/modules/mcp/client" instead.
 */

// ── Types (core portable contract) ──────────────────────────
export * from "./types";

// ── Models (app-specific response types) ──────────────────────
export * from "./models/response-types";

// ── Registry ────────────────────────────────────────────────
export * from "./registry/tool-registry";

// ── Services ────────────────────────────────────────────────
export * from "./services/create-mcp-server";
export * from "./services/stdio-transport";
export * from "./services/http-transport";

// ── Utils ───────────────────────────────────────────────────
export * from "./utils/serialize";
