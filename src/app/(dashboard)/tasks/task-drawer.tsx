"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownView } from "@/components/documents/markdown-view";
import { notify } from "@/lib/notifications/client";
import { TaskInlineEditor } from "./[id]/inline-editor";
import type { TaskProjectOption } from "./task-editor";
import { TaskDescription } from "./[id]/task-description";
import { TaskFiles } from "./[id]/task-files";
import { CommentForm } from "./[id]/comment-form";
import { DeleteCommentForm } from "./[id]/task-actions";
import { getTaskDrawerDataAction, type TaskDrawerData } from "./actions";

type DrawerContextValue = { openTask: (taskId: number) => void };

const DrawerContext = createContext<DrawerContextValue | null>(null);

export function useTaskDrawer() {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error("useTaskDrawer must be used inside TaskDrawerProvider.");
  return ctx;
}

export function TaskDrawerProvider({
  projects,
  customStatuses,
  children,
}: {
  projects: TaskProjectOption[];
  customStatuses: { id: number; name: string }[];
  children: React.ReactNode;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [data, setData] = useState<TaskDrawerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async (taskId: number) => {
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const next = await getTaskDrawerDataAction(taskId);
      if (request === requestRef.current) setData(next);
    } catch (err) {
      if (request === requestRef.current) {
        const message = err instanceof Error ? err.message : "Could not load the task.";
        setError(message);
        notify.error("Task not loaded", message, "task-drawer");
      }
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, []);

  const openTask = useCallback(
    (taskId: number) => {
      setOpenId(taskId);
      setData(null);
      void load(taskId);
    },
    [load]
  );

  const close = useCallback(() => {
    requestRef.current += 1;
    setOpenId(null);
    setData(null);
    setError(null);
  }, []);

  const reload = useCallback(() => {
    if (openId !== null) void load(openId);
  }, [openId, load]);

  useEffect(() => {
    if (openId === null) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [openId, close]);

  return (
    <DrawerContext.Provider value={{ openTask }}>
      {children}
      {openId !== null ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Close task details"
            onClick={close}
            className="absolute inset-0 bg-ink/40 backdrop-blur-[1px]"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label={data?.task.title ? `Task details: ${data.task.title}` : "Task details"}
            className="relative flex h-full w-full max-w-2xl flex-col border-l-2 border-ink bg-background shadow-[-8px_0_0_var(--ink)]"
          >
            <header className="flex items-start justify-between gap-3 border-b-2 border-ink bg-card px-4 py-3">
              <div className="min-w-0">
                <p className="eyebrow text-muted-foreground">
                  Task details · created {data?.task.createdAt.slice(0, 10) ?? "…"}
                </p>
                <h2 className="truncate font-heading text-lg font-extrabold uppercase">
                  {data?.task.title ?? "Loading…"}
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {openId !== null ? (
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/tasks/${openId}`} aria-label="Open full task page">
                      <ExternalLink className="size-4" />
                    </Link>
                  </Button>
                ) : null}
                <Button size="icon" variant="ghost" onClick={close} aria-label="Close">
                  <X className="size-4" />
                </Button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {loading && !data ? (
                <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Loading task…
                </div>
              ) : error && !data ? (
                <div className="space-y-3 p-2">
                  <p className="text-sm text-destructive">{error}</p>
                  <Button size="sm" variant="outline" onClick={reload}>Try again</Button>
                </div>
              ) : data ? (
                <div className="space-y-6">
                  <section className="space-y-2">
                    <h3 className="eyebrow text-muted-foreground">Description</h3>
                    <TaskDescription taskId={data.task.id} description={data.task.description} onSaved={reload} />
                  </section>

                  <section className="space-y-2">
                    <h3 className="eyebrow text-muted-foreground">Fields</h3>
                    <TaskInlineEditor
                      key={`${data.task.id}-${data.task.updatedAt}`}
                      task={{
                        id: data.task.id,
                        projectId: data.task.projectId,
                        listId: data.task.listId,
                        title: data.task.title,
                        description: data.task.description,
                        status: data.task.status,
                        priority: data.task.priority,
                        quadrant: data.task.quadrant,
                        dueAt: data.task.dueAt,
                        customStatusId: data.task.customStatusId,
                        assigneeIds: data.task.assigneeIds,
                        tags: data.task.tags,
                      }}
                      progress={data.task.progress}
                      projects={projects}
                      customStatuses={customStatuses}
                      onSaved={reload}
                    />
                  </section>

                  <section className="space-y-2">
                    <h3 className="eyebrow text-muted-foreground">Tags</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {data.task.tags.length === 0 ? (
                        <span className="text-sm text-muted-foreground">No tags.</span>
                      ) : (
                        data.task.tags.map((tag) => (
                          <span key={tag} className="chip chip-cyan">{tag}</span>
                        ))
                      )}
                    </div>
                  </section>

                  <section className="space-y-3">
                    <h3 className="eyebrow text-muted-foreground">Attachments ({data.files.length})</h3>
                    <TaskFiles
                      taskId={data.task.id}
                      driveConnected={data.driveConnected}
                      files={data.files}
                      onChanged={reload}
                    />
                  </section>

                  <section className="space-y-3">
                    <h3 className="eyebrow text-muted-foreground">Comments ({data.comments.length})</h3>
                    <CommentForm taskId={data.task.id} onAdded={reload} />
                    <div className="space-y-2">
                      {data.comments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No comments yet.</p>
                      ) : (
                        data.comments.map((comment) => (
                          <div key={comment.id} className="rounded-xl border-2 border-ink bg-card p-3 shadow-[2px_2px_0_var(--ink)]">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-extrabold">{comment.authorName}</p>
                              <p className="text-xs text-muted-foreground">
                                {comment.createdAt.slice(0, 16).replace("T", " ")}
                              </p>
                            </div>
                            <MarkdownView markdown={comment.body} className="mt-1 text-sm text-muted-foreground" />
                            <DeleteCommentForm commentId={comment.id} taskId={data.task.id} onDeleted={reload} />
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </DrawerContext.Provider>
  );
}
