"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { deleteDocumentAction, setDocumentArchivedAction } from "@/app/(dashboard)/documents/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notify } from "@/lib/notifications/client";

type DocumentRef = { id: number; title: string };

export function ArchiveDocumentButton({ document, archived }: { document: DocumentRef; archived: boolean }) {
  const [pending, startTransition] = useTransition();
  const Icon = archived ? ArchiveRestore : Archive;
  const label = archived ? "Restore" : "Archive";

  function changeArchive() {
    const notice = `doc-archive-${document.id}`;
    startTransition(async () => {
      try {
        const result = await setDocumentArchivedAction(document.id, !archived);
        if (!result.success) throw new Error(result.error);
        notify.success(archived ? "Document restored" : "Document archived", document.title, notice);
      } catch (error) {
        notify.error(`${label} failed`, error instanceof Error ? error.message : "Try again.", notice);
      }
    });
  }

  return <Button size="sm" variant="outline" onClick={changeArchive} disabled={pending} aria-label={`${label} ${document.title}`}><Icon />{label}</Button>;
}

export function DeleteDocumentButton({ document, onDeleted }: { document: DocumentRef; onDeleted?: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const notice = `doc-delete-${document.id}`;

  function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const result = await deleteDocumentAction({ success: false }, data);
        if (!result.success) throw new Error(result.error);
        notify.success("Document deleted", document.title, notice);
        setOpen(false);
        onDeleted?.();
      } catch (error) {
        notify.error("Document not deleted", error instanceof Error ? error.message : "Try again.", notice);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) { setOpen(next); setReason(""); } }}>
      <DialogTrigger asChild><Button size="sm" variant="outline" className="text-destructive" aria-label={`Delete ${document.title}`}><Trash2 />Delete</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{document.title}”?</DialogTitle>
          <DialogDescription>This permanently deletes the document and its attachments. Your reason is recorded in the deletion audit.</DialogDescription>
        </DialogHeader>
        <form onSubmit={remove} className="space-y-4">
          <input type="hidden" name="documentId" value={document.id} />
          <div className="space-y-1">
            <Label htmlFor={notice}>Deletion reason</Label>
            <Input id={notice} name="reason" required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline" disabled={pending}>Cancel</Button></DialogClose>
            <Button type="submit" variant="destructive" disabled={pending || !reason.trim()}>{pending ? "Deleting…" : "Delete document"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
