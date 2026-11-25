"use client";

import { InlineAssignees, InlineDue, InlinePriority, InlineQuadrant, InlineStatus, InlineTitle, type InlineTask } from "./task-inline";
import type { TaskProjectOption } from "./task-editor";

export type MatrixRow = InlineTask & { projectName: string; listName: string };

const QUADRANTS = [
  { key: "DO_FIRST", title: "Do first", hint: "Important + urgent", tone: "border-t-rose-400" },
  { key: "SCHEDULE", title: "Schedule", hint: "Important + not urgent", tone: "border-t-sky-400" },
  { key: "DELEGATE", title: "Delegate", hint: "Not important + urgent", tone: "border-t-amber-400" },
  { key: "ELIMINATE", title: "Eliminate", hint: "Not important + not urgent", tone: "border-t-slate-400" },
] as const;

export function TaskMatrix({ rows, projects }: { rows: MatrixRow[]; projects: TaskProjectOption[] }) {
  const unclassified = rows.filter((row) => !row.quadrant);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        {QUADRANTS.map((quadrant) => {
          const items = rows.filter((row) => row.quadrant === quadrant.key);
          return (
            <section key={quadrant.key} className={`block-card border-t-4 ${quadrant.tone} p-3`}>
              <header className="mb-2 flex items-start justify-between gap-2 px-1">
                <div>
                  <h2 className="font-heading text-sm font-extrabold uppercase">{quadrant.title}</h2>
                  <p className="text-xs text-muted-foreground">{quadrant.hint}</p>
                </div>
                <span className="chip chip-paper">{items.length}</span>
              </header>
              <div className="space-y-2">
                {items.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    Nothing here.
                  </p>
                ) : (
                  items.map((row) => {
                    const members = projects.find((project) => project.id === row.projectId)?.members ?? [];
                    return (
                      <article key={row.id} className="space-y-2 rounded-xl border border-border bg-card p-3 shadow-sm">
                        <InlineTitle task={row} />
                        <p className="text-[11px] text-muted-foreground">{row.projectName} / {row.listName}</p>
                        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                          <InlineStatus task={row} />
                          <InlinePriority task={row} />
                          <InlineDue task={row} />
                          <InlineAssignees task={row} members={members} />
                        </div>
                        <InlineQuadrant task={row} />
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>

      <section className="block-card p-3">
        <header className="mb-2 flex items-center justify-between px-1">
          <div>
            <h2 className="font-heading text-sm font-extrabold uppercase">Unclassified</h2>
            <p className="text-xs text-muted-foreground">Pick a quadrant inline to file these tasks.</p>
          </div>
          <span className="chip chip-paper">{unclassified.length}</span>
        </header>
        {unclassified.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Every task has a quadrant.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {unclassified.map((row) => (
              <article key={row.id} className="space-y-2 rounded-xl border border-border bg-card p-3 shadow-sm">
                <InlineTitle task={row} />
                <p className="text-[11px] text-muted-foreground">{row.projectName} / {row.listName}</p>
                <InlineQuadrant task={row} />
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
