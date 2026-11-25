"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FileText, ListTree, Maximize2, Minimize2, Paperclip, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notifications/client";
import {
  deleteAttachmentAction,
  deleteDocumentAction,
  updateDocumentAction,
  uploadAttachmentAction,
} from "@/app/(dashboard)/documents/actions";
import { DocumentOutline, useDocumentOutline } from "./outline";
import { VoiceNoteRecorder } from "./voice-note-recorder";

const MarkdownEditor = dynamic(() => import("./editor"), {
  ssr: false,
  loading: () => <div className="p-8 text-sm text-muted-foreground">Loading editor…</div>,
});

export type DocumentAttachmentMeta = {
  id: number;
  kind: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

export type DocumentData = {
  id: number;
  projectName: string;
  title: string;
  contentMarkdown: string;
  version: number;
  attachments: DocumentAttachmentMeta[];
};

export function DocumentButton({ document, compact = false }: { document: DocumentData; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={compact ? "ghost" : "outline"}
        size="sm"
        onClick={() => setOpen(true)}
        className={compact ? "size-8 p-0" : undefined}
        aria-label={`Open document ${document.title}`}
      >
        <FileText className="size-4" />{compact ? null : "Open"}
      </Button>
      {open ? <DocumentDrawer document={document} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function DocumentDrawer({ document, onClose }: { document: DocumentData; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(document.title);
  const [markdown, setMarkdown] = useState(document.contentMarkdown);
  const [version, setVersion] = useState(document.version);
  const [attachments, setAttachments] = useState(document.attachments);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [fullscreen, setFullscreen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const editorHost = useRef<HTMLDivElement>(null);
  const headings = useDocumentOutline(editorHost, outlineOpen);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateDocumentAction({ success: false }, data);
      if (!result.success) {
        notify.error("Document not saved", result.error, `doc-save-${document.id}`);
        return;
      }
      if (result.version) setVersion(result.version);
      notify.success("Document saved", `Version ${result.version ?? version + 1}`, `doc-save-${document.id}`);
      router.refresh();
    });
  }

  function remove() {
    const data = new FormData();
    data.set("documentId", String(document.id));
    data.set("reason", reason);
    startTransition(async () => {
      const result = await deleteDocumentAction({ success: false }, data);
      if (!result.success) {
        notify.error("Document not deleted", result.error, `doc-delete-${document.id}`);
        return;
      }
      notify.success("Document deleted", "An immutable audit was recorded.", `doc-delete-${document.id}`);
      router.refresh();
      onClose();
    });
  }

  function upload(file: File) {
    const data = new FormData();
    data.set("documentId", String(document.id));
    data.set("file", file);
    startTransition(async () => {
      const result = await uploadAttachmentAction({ success: false }, data);
      if (!result.success || !result.attachment) {
        notify.error("Attachment not added", result.error, `doc-attach-${document.id}`);
        return;
      }
      setAttachments((previous) => [...previous, result.attachment!]);
      notify.success("Attachment added", result.attachment.fileName, `doc-attach-${document.id}`);
    });
  }

  function removeAttachment(attachmentId: number, fileName: string) {
    const data = new FormData();
    data.set("attachmentId", String(attachmentId));
    startTransition(async () => {
      const result = await deleteAttachmentAction({ success: false }, data);
      if (!result.success) {
        notify.error("Attachment not deleted", result.error, `doc-attach-${document.id}`);
        return;
      }
      setAttachments((previous) => previous.filter((item) => item.id !== attachmentId));
      notify.success("Attachment deleted", fileName, `doc-attach-${document.id}`);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label={`Document ${title}`}>
      <button type="button" className="flex-1 cursor-default" aria-label="Close document" onClick={onClose} />
      <aside className={`flex h-full w-full flex-col border-l border-border bg-background shadow-2xl ${fullscreen ? "max-w-none" : "max-w-4xl"}`}>
        <header className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Document title" className="h-9 min-w-0 flex-1 font-bold" />
          <Button type="button" variant="outline" size="sm" onClick={() => setOutlineOpen((value) => !value)} aria-pressed={outlineOpen}>
            <ListTree className="size-4" /> Outline
          </Button>
          <VoiceNoteRecorder onRecorded={upload} disabled={pending} />
          <label className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-md border border-border px-2 text-xs font-bold uppercase">
            <Paperclip className="size-3.5" /> Attach
            <input type="file" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload(file); }} />
          </label>
          <Button type="button" variant="outline" size="sm" onClick={() => setFullscreen((value) => !value)} aria-label={fullscreen ? "Exit full screen" : "Full screen"}>
            {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close"><X className="size-4" /></Button>
        </header>

        <div className="flex min-h-0 flex-1">
          {outlineOpen ? (
            <div className="hidden w-56 shrink-0 overflow-y-auto border-r border-border p-2 md:block">
              <DocumentOutline headings={headings} collapsed={collapsed} onCollapseChange={setCollapsed} onJump={(element) => element.scrollIntoView({ behavior: "smooth", block: "start" })} />
            </div>
          ) : null}

          <div className="flex min-w-0 flex-1 flex-col">
            <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
              <input type="hidden" name="documentId" value={document.id} />
              <input type="hidden" name="title" value={title} />
              <input type="hidden" name="contentMarkdown" value={markdown} />
              <input type="hidden" name="version" value={version} />
              <div ref={editorHost} className="min-h-0 flex-1 overflow-y-auto p-3">
                <MarkdownEditor markdown={markdown} onChange={setMarkdown} minHeight={420} />
              </div>
              <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3">
                <span className="text-xs text-muted-foreground">{document.projectName} · v{version} · {markdown.length.toLocaleString()} chars</span>
                <Button type="submit" disabled={pending}><Save className="size-4" /> {pending ? "Saving…" : "Save"}</Button>
              </footer>
            </form>

            <section className="max-h-56 shrink-0 overflow-y-auto border-t border-border p-3">
              <p className="eyebrow mb-2 text-muted-foreground">Attachments ({attachments.length})</p>
              {attachments.length === 0 ? (
                <p className="text-xs text-muted-foreground">Record a voice note or attach a file.</p>
              ) : (
                <div className="space-y-2">
                  {attachments.map((attachment) => (
                    <div key={attachment.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 text-xs">
                      <span className="font-bold">{attachment.fileName}</span>
                      <span className="text-muted-foreground">{Math.ceil(attachment.size / 1024)} KB</span>
                      {attachment.kind === "AUDIO" ? (
                        <audio controls src={`/api/documents/attachments/${attachment.id}`} className="h-8 max-w-full" />
                      ) : (
                        <a className="text-primary underline" href={`/api/documents/attachments/${attachment.id}`} target="_blank" rel="noreferrer">Open</a>
                      )}
                      <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => removeAttachment(attachment.id, attachment.fileName)} aria-label={`Delete ${attachment.fileName}`}><Trash2 className="size-3.5" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <details className="border-t border-border p-3">
              <summary className="cursor-pointer text-xs font-bold uppercase text-destructive">Delete document</summary>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason (required)" className="h-8 w-64" />
                <Button type="button" variant="destructive" size="sm" disabled={pending || !reason.trim()} onClick={remove}>
                  {pending ? "Deleting…" : "Delete"}
                </Button>
              </div>
            </details>
          </div>
        </div>
      </aside>
    </div>
  );
}
