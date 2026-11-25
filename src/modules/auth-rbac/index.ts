/**
 * auth-rbac module — public API
 *
 * Import everything from "@/modules/auth-rbac" — never reach into subdirectories.
 *
 * This module is portable: it has ZERO imports from app business logic
 * (src/app/, src/lib/mutations/, src/components/).
 * Only generic dependencies are allowed (Prisma generated types, standard library).
 */

// ⚠️  SERVER-ONLY — Do NOT import this from "use client" components.
// For client components, import from "@/modules/auth-rbac/client" instead.

// ── Types ───────────────────────────────────────────────────
export * from "./types";

// ── Models (Prisma type re-exports) ─────────────────────────
export * from "./models";

// ── Registry ────────────────────────────────────────────────
export * from "./registry";

// ── Services ────────────────────────────────────────────────
export * from "./services";

// ── Middleware ───────────────────────────────────────────────
export * from "./middleware";

// ── Hooks ───────────────────────────────────────────────────
export * from "./hooks";

// ── Components ──────────────────────────────────────────────
export * from "./components";

// ── Utils ───────────────────────────────────────────────────
export * from "./utils";
