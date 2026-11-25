/**
 * Defines a permissionable page in the application.
 *
 * The auth-rbac module does not know about app pages until they are registered.
 * The app-side registration file bridges sidebar navigation items to this interface.
 */
export interface PageDefinition {
  /**
   * Unique key identifying this page. Used in PermissionTemplatePage.pageKey
   * and UserPermissionOverride.pageKey columns.
   *
   * Convention: kebab-case, matching the URL path segment
   * (e.g., "purchase-orders", "journal", "settings-company").
   */
  pageKey: string;

  /**
   * Human-readable name shown in permission template UIs.
   * Should match the sidebar nav label exactly.
   */
  displayName: string;

  /**
   * Section/group this page belongs to (e.g., "Procurement", "Accounting", "Settings").
   * Used for grouping in permission template editors.
   */
  section: string;

  /**
   * The route path for this page (e.g., "/purchase-orders", "/journal").
   * Used for permission enforcement at the page level.
   */
  path: string;

  /**
   * Additional route paths controlled by this same permission.
   * These do not create separate permission template rows.
   */
  aliases?: string[];
}
