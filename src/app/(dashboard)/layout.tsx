import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { getActiveCompany } from "@/lib/company/get-active-company";
import { getUserRole } from "@/lib/auth/get-user-role";
import { registerAppPages } from "@/lib/auth/page-definitions";
import { matchPageForPath } from "@/lib/auth/page-path-match";
import { ALL_NAV_SECTIONS } from "@/lib/nav/nav-sections";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { prisma } from "@/lib/db";
import { pageRegistry } from "@/modules/auth-rbac";
import {
  AccessLevel,
  getPageAccessLevel,
} from "@/modules/auth-rbac/middleware/page-access";
import { PermissionProvider } from "@/modules/auth-rbac/middleware/permission-provider";
import { PageAccessGuard } from "@/components/dashboard/page-access-guard";
import { Role } from "@/generated/prisma/enums";
import { logoutAction, switchWorkspaceAction } from "./actions";
import { hasPermissionAssignment } from "@/modules/auth-rbac/services/assignment-service";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAuth();
  const company = await getActiveCompany(user.id);
  const userRole = await getUserRole(user.id, company.id);

  if (userRole !== Role.SUPER_ADMIN && !(await hasPermissionAssignment(user.id, company.id))) {
    redirect("/awaiting-permissions");
  }

  const memberships = await prisma.userCompanyRole.findMany({
    where: { userId: user.id },
    include: { company: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  registerAppPages();
  const pages = pageRegistry.getPages();

  const permissionEntries = await Promise.all(
    pages.map(async (page) => [page.pageKey, await getPageAccessLevel(user.id, company.id, page.pageKey)] as const)
  );
  const pagePermissions: Record<string, string> = Object.fromEntries(permissionEntries);

  const alwaysAccessibleKeys = ALL_NAV_SECTIONS.flatMap((s) => s.items)
    .filter((i) => i.alwaysAccessible && i.pageKey)
    .map((i) => i.pageKey as string);

  const pathname = (await headers()).get("x-pathname");
  if (pathname && userRole !== Role.SUPER_ADMIN) {
    const key = matchPageForPath(pages, pathname)?.pageKey;
    if (key && !alwaysAccessibleKeys.includes(key)) {
      const level = pagePermissions[key];
      if (level === AccessLevel.NONE || level === undefined) {
        const first = pages.find(
          (p) => alwaysAccessibleKeys.includes(p.pageKey) || (pagePermissions[p.pageKey] && pagePermissions[p.pageKey] !== AccessLevel.NONE)
        );
        if (first?.path && first.path !== pathname) redirect(first.path);
      }
    }
  }

  const approvalRequiredPages =
    userRole === Role.SUPER_ADMIN
      ? []
      : (
          await prisma.userPermissionAssignment.findUnique({
            where: { userId_companyId: { userId: user.id, companyId: company.id } },
            select: { template: { select: { pages: { where: { requiresApproval: true }, select: { pageKey: true } } } } },
          })
        )?.template.pages.map((p) => p.pageKey) ?? [];

  const navSections = ALL_NAV_SECTIONS.map((section) => ({
    title: section.title,
    items: section.items
      .filter((item) => {
        if (item.hidden) return false;
        if (item.adminOnly && userRole !== Role.ADMIN && userRole !== Role.SUPER_ADMIN) return false;
        if (!item.pageKey || item.alwaysAccessible) return true;
        const level = pagePermissions[item.pageKey];
        return level !== undefined && level !== AccessLevel.NONE;
      })
      .map((item) => ({ label: item.label, href: item.href })),
  })).filter((section) => section.items.length > 0);

  return (
    <PermissionProvider permissions={pagePermissions} approvalRequiredPages={approvalRequiredPages}>
      <div className="min-h-screen lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-screen flex-col border-r-2 border-ink bg-card lg:flex">
          <div className="border-b-2 border-ink bg-primary p-4 text-primary-foreground">
            <p className="eyebrow opacity-75">Consologist</p>
            <p className="font-heading text-2xl font-black uppercase leading-none tracking-tight">TMS</p>
          </div>
          <div className="border-b-2 border-ink bg-muted p-3">
            <p className="eyebrow text-muted-foreground">Workspace</p>
            <p className="truncate font-heading text-sm font-extrabold uppercase">{company.name}</p>
          </div>
          <div className="min-h-0 flex-1"><SidebarNav sections={navSections} /></div>
          <div className="border-t-2 border-ink p-3">
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            <form action={logoutAction}>
              <button type="submit" className="mt-1 text-xs font-extrabold uppercase tracking-wide underline">Sign out</button>
            </form>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-30 border-b-2 border-ink bg-background/95 backdrop-blur">
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 sm:px-5">
              <div className="flex min-w-0 items-center gap-2.5">
                <MobileNav sections={navSections} workspace={company.name} />
                <div className="min-w-0">
                  <p className="eyebrow text-muted-foreground">Workspace</p>
                  <p className="truncate font-heading text-sm font-extrabold uppercase">{company.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <form action={switchWorkspaceAction} className="hidden items-center gap-2 sm:flex">
                  <select
                    id="workspace-select"
                    name="companyId"
                    defaultValue={String(company.id)}
                    aria-label="Switch workspace"
                    data-compact="true"
                    className="block-input max-w-48 font-semibold"
                  >
                    {memberships.map((membership) => (
                      <option key={membership.company.id} value={membership.company.id}>{membership.company.name}</option>
                    ))}
                  </select>
                  <button id="workspace-switch" type="submit" className="h-control-sm px-1 text-xs font-extrabold uppercase underline">Switch</button>
                </form>
                <span className="hidden size-9 items-center justify-center rounded-full border-2 border-ink bg-accent text-xs font-black uppercase sm:flex" title={user.email}>
                  {(user.fullName ?? user.email).split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}
                </span>
                <form action={logoutAction} className="sm:hidden">
                  <button type="submit" className="text-xs font-extrabold uppercase underline">Sign out</button>
                </form>
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1500px] flex-1 p-4 sm:p-6 lg:p-10">
            <PageAccessGuard registeredPages={pages} alwaysAccessibleKeys={alwaysAccessibleKeys}>
              {children}
            </PageAccessGuard>
          </main>
          <footer className="border-t-2 border-ink px-4 py-4 text-xs text-muted-foreground">
            <span className="font-extrabold uppercase tracking-wide">Consologist TMS</span> · Task Management System
          </footer>
        </div>
      </div>
    </PermissionProvider>
  );
}
