import type { PageDefinition } from "../types";

/**
 * Registry of all permissionable pages in the application.
 *
 * The application registers its pages at startup via register().
 * The auth-rbac module then uses this registry to:
 * - Populate permission template editors with all available pages
 * - Validate pageKey values in templates and overrides
 * - Resolve page metadata for audit logs and UI display
 *
 * This class has ZERO knowledge of the app's routing or sidebar structure.
 * It only knows what the app tells it via register().
 */
export class PageRegistry {
  private pages: Map<string, PageDefinition> = new Map();
  private frozen = false;

  /**
   * Register page definitions. Can be called multiple times before freeze().
   * Duplicate pageKeys within the same call or across calls will throw.
   *
   * @param definitions - Array of page definitions to register
   * @throws Error if a duplicate pageKey is detected
   * @throws Error if the registry has been frozen
   */
  register(definitions: PageDefinition[]): void {
    if (this.frozen) {
      throw new Error(
        "PageRegistry is frozen — register() must be called before freeze()"
      );
    }

    for (const def of definitions) {
      if (this.pages.has(def.pageKey)) {
        throw new Error(
          `Duplicate pageKey "${def.pageKey}" — each page must have a unique key`
        );
      }
      this.pages.set(def.pageKey, { ...def });
    }
  }

  /**
   * Freeze the registry. After this, no more registrations are accepted.
   * Call this after all pages have been registered at app startup.
   * Calling freeze() more than once is a no-op.
   */
  freeze(): void {
    this.frozen = true;
  }

  /**
   * Check if the registry has been frozen.
   * Use this to guard idempotent initialization calls.
   */
  isFrozen(): boolean {
    return this.frozen;
  }

  /**
   * Get all registered pages, sorted by section then displayName.
   */
  getPages(): PageDefinition[] {
    return Array.from(this.pages.values()).sort((a, b) => {
      const sectionCmp = a.section.localeCompare(b.section);
      if (sectionCmp !== 0) return sectionCmp;
      return a.displayName.localeCompare(b.displayName);
    });
  }

  /**
   * Get a single page by its unique key.
   *
   * @returns The page definition, or undefined if not found
   */
  getPageByKey(pageKey: string): PageDefinition | undefined {
    return this.pages.get(pageKey);
  }

  /**
   * Check if a pageKey is registered.
   */
  hasPage(pageKey: string): boolean {
    return this.pages.has(pageKey);
  }

  /**
   * Get all registered pageKeys.
   */
  getPageKeys(): string[] {
    return Array.from(this.pages.keys());
  }

  /**
   * Get pages grouped by section.
   *
   * @returns Map of section name → page definitions (sorted by displayName within each section)
   */
  getPagesBySection(): Map<string, PageDefinition[]> {
    const sections = new Map<string, PageDefinition[]>();
    for (const page of this.getPages()) {
      const existing = sections.get(page.section) ?? [];
      existing.push(page);
      sections.set(page.section, existing);
    }
    return sections;
  }

  /**
   * Get the total count of registered pages.
   */
  get size(): number {
    return this.pages.size;
  }
}

/**
 * Singleton instance of the page registry.
 * Import this from "@/modules/auth-rbac" — never instantiate PageRegistry directly.
 */
export const pageRegistry = new PageRegistry();
