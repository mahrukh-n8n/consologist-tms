/**
 * Navigation section data — shared by the sidebar (client) and
 * page-definitions (server). Consologist TMS structure.
 */
import {
  Home,
  CheckSquare,
  Bell,
  ClipboardList,
  FolderOpen,
  Users,
  ShieldCheck,
  Settings,
  type LucideIcon,
  FileText,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  pageKey?: string;
  permissionAliases?: string[];
  alwaysAccessible?: boolean;
  makerOnly?: boolean;
  adminOnly?: boolean;
  /**
   * Registered as a permissionable page but not rendered in the sidebar.
   * Used for backend pages reached from an inner page (e.g. the Manage System hub).
   */
  hidden?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
  adminOnly?: boolean;
  bottomPinned?: boolean;
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Workspace",
    items: [
      { label: "Home", href: "/dashboard", icon: Home, pageKey: "dashboard" },
      { label: "My Tasks", href: "/dashboard/tasks", icon: CheckSquare, pageKey: "dashboard-tasks" },
    ],
  },
  {
    title: "Projects",
    items: [
      { label: "Projects", href: "/projects", icon: FolderOpen, pageKey: "projects" },
      { label: "Tasks", href: "/tasks", icon: CheckSquare, pageKey: "tasks" },
      { label: "Documents", href: "/documents", icon: FileText, pageKey: "documents" },
      { label: "Files", href: "/files", icon: FolderOpen, pageKey: "files", hidden: true },
      // Legacy pages kept for MCP/permission parity; not shown in the sidebar.
      { label: "Discussions", href: "/discussions", icon: FileText, pageKey: "discussions", hidden: true },
      { label: "Calendar", href: "/dashboard/calendar", icon: FileText, pageKey: "dashboard-calendar", hidden: true },
      { label: "Time", href: "/dashboard/time", icon: FileText, pageKey: "dashboard-time", hidden: true },
    ],
  },
  {
    title: "Activity",
    items: [
      { label: "Notifications", href: "/notifications", icon: Bell, pageKey: "notifications" },
      { label: "Chat", href: "/chat", icon: FileText, pageKey: "chat", hidden: true },
    ],
  },
];

export const NAV_BOTTOM_SECTIONS: NavSection[] = [
  {
    title: "My Account",
    items: [
      { label: "My Account", href: "/manage/account", icon: Settings, pageKey: "manage-account", alwaysAccessible: true },
      { label: "Manage System", href: "/manage-system", icon: Users, pageKey: "manage-system", adminOnly: true },
      // Reached from the Manage System hub, not the sidebar.
      { label: "Users", href: "/manage-system/users", icon: Users, pageKey: "manage-system-users", adminOnly: true, hidden: true },
      { label: "Approvals", href: "/manage-system/approvals", icon: ClipboardList, pageKey: "manage-system-approvals", adminOnly: true, hidden: true },
      { label: "Audit", href: "/manage-system/audit", icon: Users, pageKey: "manage-system-audit", adminOnly: true, hidden: true },
      { label: "Permissions", href: "/manage-system/permissions", icon: ShieldCheck, pageKey: "manage-system-permissions", adminOnly: true, hidden: true },
      { label: "Google Drive", href: "/manage-system/drive", icon: FolderOpen, pageKey: "manage-system-drive", adminOnly: true, hidden: true },
      { label: "Tags", href: "/manage-system/tags", icon: ClipboardList, pageKey: "manage-system-tags", adminOnly: true, hidden: true },
      { label: "Custom Statuses", href: "/manage-system/statuses", icon: ClipboardList, pageKey: "manage-system-statuses", adminOnly: true, hidden: true },
      { label: "Backups", href: "/manage-system/backups", icon: ClipboardList, pageKey: "manage-system-backups", adminOnly: true, hidden: true },
    ],
    bottomPinned: true,
  },
];

export const ALL_NAV_SECTIONS: NavSection[] = [...NAV_SECTIONS, ...NAV_BOTTOM_SECTIONS];
