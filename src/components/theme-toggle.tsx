"use client";

import { useSyncExternalStore } from "react";
import { LayoutPanelTop, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "flat" | "block";
const KEY = "tms-theme";
const CHANGE_EVENT = "tms-theme-change";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function getSnapshot(): Theme {
  return localStorage.getItem(KEY) === "block" ? "block" : "flat";
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore<Theme>(subscribe, getSnapshot, () => "flat");

  function apply(next: Theme) {
    document.documentElement.dataset.theme = next;
    localStorage.setItem(KEY, next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return (
    <div className={cn("inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1", className)} role="group" aria-label="Theme">
      <button
        type="button"
        onClick={() => apply("flat")}
        aria-pressed={theme === "flat"}
        className={cn(
          "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold uppercase transition",
          theme === "flat" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <LayoutPanelTop className="size-3.5" /> Flat
      </button>
      <button
        type="button"
        onClick={() => apply("block")}
        aria-pressed={theme === "block"}
        className={cn(
          "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold uppercase transition",
          theme === "block" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Sparkles className="size-3.5" /> Block
      </button>
    </div>
  );
}
