"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { SidebarNav, type NavSectionView } from "./sidebar-nav";

export function MobileNav({ sections, workspace }: { sections: NavSectionView[]; workspace: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Open navigation"
          className="flex size-10 items-center justify-center rounded-xl border-2 border-ink bg-card shadow-[3px_3px_0_var(--ink)] lg:hidden"
        >
          <Menu className="size-5" />
        </button>
      </DialogTrigger>
      <DialogContent className="block-card fixed left-0 top-0 h-dvh max-h-dvh w-[min(20rem,92vw)] translate-x-0 translate-y-0 overflow-y-auto rounded-none border-y-0 border-l-0 p-0 shadow-none">
        <DialogTitle className="sr-only">Navigation</DialogTitle>
        <div className="flex items-center justify-between border-b-2 border-ink bg-primary p-4 text-primary-foreground">
          <div>
            <p className="eyebrow opacity-80">Consologist</p>
            <p className="font-heading text-xl font-extrabold uppercase">TMS</p>
          </div>
          <button type="button" aria-label="Close navigation" onClick={() => setOpen(false)} className="rounded-lg border-2 border-ink bg-card p-1.5 text-ink">
            <X className="size-4" />
          </button>
        </div>
        <div className="border-b-2 border-ink bg-muted px-4 py-3 text-sm font-bold">{workspace}</div>
        <div onClick={() => setOpen(false)}>
          <SidebarNav sections={sections} />
        </div>
        <div className="p-4">
          <Link href="/manage/account" onClick={() => setOpen(false)} className="text-sm font-bold underline">My Account</Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
