"use client";

import { useContext, useMemo } from "react";
import { usePathname } from "next/navigation";
import { PermissionContext } from "@/modules/auth-rbac/client";
import type { PageDefinition } from "@/modules/auth-rbac";
import { matchPageForPath } from "@/lib/auth/page-path-match";

interface PageAccessGuardProps {
  children: React.ReactNode;
  /** All registered pageKeys so we can match URL → pageKey */
  registeredPages: PageDefinition[];
  /** Pages that bypass permission checks (accessible to all authenticated users) */
  alwaysAccessibleKeys?: string[];
}

/**
 * Client-side guard that blocks page content when the user has no access.
 *
 * Runs on every client-side navigation (usePathname triggers re-render).
 * Converts the current pathname to a pageKey and checks against the
 * PermissionContext. If access is NONE, replaces children with a message.
 *
 * This complements the server-side check in the dashboard layout (which
 * only runs on full page loads / layout re-renders).
 */
export function PageAccessGuard({ children, registeredPages, alwaysAccessibleKeys = [] }: PageAccessGuardProps) {
  const permissions = useContext(PermissionContext);
  const pathname = usePathname();

  const isBlocked = useMemo(() => {
    if (!permissions || !pathname) return false;

    const matchedPageKey = matchPageForPath(registeredPages, pathname)?.pageKey ?? null;

    if (!matchedPageKey) return false;
    if (alwaysAccessibleKeys.includes(matchedPageKey)) return false;

    const level = permissions[matchedPageKey];
    return level === "NONE" || level === undefined;
  }, [permissions, pathname, registeredPages, alwaysAccessibleKeys]);

  if (isBlocked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">
          You don&apos;t have permission to view this page. Use the sidebar to
          navigate to a page you have access to.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
