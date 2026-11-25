"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, CheckSquare, Bell, FolderOpen, FileText, Users, Settings, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  "/dashboard": Home,
  "/dashboard/tasks": CheckSquare,
  "/projects": FolderOpen,
  "/tasks": CheckSquare,
  "/documents": FileText,
  "/files": FolderOpen,
  "/notifications": Bell,
  "/manage/account": Settings,
  "/manage-system": Users,
};

export type NavSectionView = { title: string; items: { label: string; href: string }[] };

export function SidebarNav({ sections }: { sections: NavSectionView[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-3 overflow-hidden px-3 py-3">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="eyebrow mb-1.5 px-2 text-muted-foreground">{section.title}</p>
          <div className="space-y-1">
            {section.items.map((item) => {
              const Icon = ICONS[item.href] ?? FolderOpen;
              const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex min-h-9 items-center gap-2.5 rounded-xl border-2 px-2.5 py-1 text-sm font-bold transition",
                    active
                      ? "border-ink bg-accent text-accent-foreground shadow-[3px_3px_0_var(--ink)]"
                      : "border-transparent hover:border-ink hover:bg-muted"
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", active ? "text-ink" : "text-primary")} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
