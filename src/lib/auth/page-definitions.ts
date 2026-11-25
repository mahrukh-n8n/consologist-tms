import { pageRegistry } from "@/modules/auth-rbac/registry";
import type { PageDefinition } from "@/modules/auth-rbac/types";
import { NAV_SECTIONS, NAV_BOTTOM_SECTIONS } from "@/lib/nav/nav-sections";

/**
 * Derive pageKey from a nav item's href path.
 *
 * Converts the URL path to a kebab-case key:
 *   "/purchase-orders"           → "purchase-orders"
 *   "/tools/fx-settlement"       → "tools-fx-settlement"
 *   "/settings/company"          → "settings-company"
 *   "/admin/audit-log"           → "admin-audit-log"
 *   "/dashboard"                 → "dashboard"
 *   "/operations/orders"         → "operations-orders"
 *
 * Leading slash is stripped. Remaining slashes become hyphens.
 */
function hrefToPageKey(href: string): string {
  return href.replace(/^\//, "").replace(/\//g, "-");
}

/**
 * Build PageDefinition[] from the sidebar navigation sections.
 *
 * Every nav item becomes a permissionable page. The section title
 * is preserved for grouping in permission template editors.
 */
function buildPageDefinitions(): PageDefinition[] {
  const definitions: PageDefinition[] = [];
  const allSections = [...NAV_SECTIONS, ...NAV_BOTTOM_SECTIONS];
  const seenPageKeys = new Set<string>();

  for (const section of allSections) {
    for (const item of section.items) {
      const pageKey = item.pageKey ?? hrefToPageKey(item.href);
      if (seenPageKeys.has(pageKey)) continue;
      seenPageKeys.add(pageKey);

      definitions.push({
        pageKey,
        displayName: item.label,
        section: section.title,
        path: item.href,
        aliases: item.permissionAliases,
      });
    }
  }

  return definitions;
}

/**
 * Register all app pages with the auth-rbac module.
 *
 * Safe to call on every server render — becomes a no-op once the registry
 * is frozen. Pages are registered exactly once (first call) and the registry
 * is then frozen to prevent further mutation.
 */
export function registerAppPages(): void {
  if (pageRegistry.isFrozen()) return;
  try {
    const definitions = buildPageDefinitions();
    pageRegistry.register(definitions);
    pageRegistry.freeze();
  } catch {
    // Concurrent request already registered and froze — safe to ignore.
  }
}

/**
 * Pre-built page definitions for inspection/testing.
 * Does NOT register them — call registerAppPages() to register.
 */
export const APP_PAGE_DEFINITIONS = buildPageDefinitions();
