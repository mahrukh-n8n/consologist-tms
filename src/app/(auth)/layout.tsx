import { CheckSquare, FolderOpen, Zap } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const POINTS = [
  { icon: CheckSquare, title: "Tasks that move", text: "Multi-assignee, tags, due dates, comments and approvals." },
  { icon: FolderOpen, title: "Projects in blocks", text: "Groups, projects, files and calendars in one workspace." },
  { icon: Zap, title: "Built for speed", text: "Keyboard-friendly pickers, instant feedback, zero clutter." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="absolute right-4 top-4 z-10"><ThemeToggle /></div>
      <section className="relative hidden flex-col justify-between overflow-hidden border-r-2 border-ink bg-primary p-10 text-primary-foreground lg:flex">
        <div>
          <p className="eyebrow opacity-80">Consologist</p>
          <p className="font-heading text-5xl font-black uppercase leading-[0.9] tracking-tight">TMS</p>
          <p className="mt-3 max-w-sm text-lg font-semibold opacity-90">
            Task Management System for teams that ship.
          </p>
        </div>
        <div className="space-y-3">
          {POINTS.map((point, index) => (
            <div key={point.title} className="flex items-start gap-3 rounded-2xl border-2 border-ink bg-card p-4 text-card-foreground shadow-[6px_6px_0_var(--ink)]">
              <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl border-2 border-ink ${index === 0 ? "bg-lime" : index === 1 ? "bg-cyan" : "bg-sun"}`}>
                <point.icon className="size-5" />
              </span>
              <div>
                <p className="font-heading text-sm font-extrabold uppercase">{point.title}</p>
                <p className="text-sm text-muted-foreground">{point.text}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="eyebrow opacity-70">Plan · Track · Deliver</p>
      </section>
      <section className="flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          <div className="mb-5 lg:hidden">
            <p className="eyebrow text-muted-foreground">Consologist</p>
            <p className="font-heading text-3xl font-black uppercase">TMS</p>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
