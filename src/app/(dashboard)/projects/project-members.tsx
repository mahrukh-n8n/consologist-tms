"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { notify } from "@/lib/notifications/client";
import {
  addProjectMemberAction,
  removeProjectMemberAction,
  setProjectMemberAccessAction,
  type ProjectState,
} from "./actions";

type Member = {
  userId: number;
  name: string;
  email: string;
  role: string;
  isOwner: boolean;
  accessOverride: string;
};
type Candidate = { id: number; name: string; email: string };

const ACCESS_OPTIONS = [
  { value: "INHERIT", label: "Inherit workspace role" },
  { value: "READ_ONLY", label: "Read only" },
  { value: "COMMENT", label: "Comment only" },
  { value: "READ_WRITE", label: "Read & write" },
];

function MemberAccess({ projectId, member }: { projectId: number; member: Member }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ProjectState, FormData>(setProjectMemberAccessAction, { success: false });
  const formRef = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState(member.accessOverride);

  useEffect(() => {
    if (state.error) notify.error("Access not changed", state.error, `member-access-${projectId}-${member.userId}`);
    if (state.success) {
      notify.success("Project access updated", member.name, `member-access-${projectId}-${member.userId}`);
      router.refresh();
    }
  }, [state, projectId, member.userId, member.name, router]);

  if (member.isOwner) {
    return <span className="text-[11px] font-bold uppercase text-muted-foreground">Full access (owner)</span>;
  }

  return (
    <form ref={formRef} action={action} className="min-w-48">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="userId" value={member.userId} />
      <input type="hidden" name="accessOverride" value={value} />
      <SearchableSelect
        id={`member-access-${projectId}-${member.userId}`}
        noClear
        value={value}
        onChange={(next) => {
          setValue(next);
          formRef.current?.requestSubmit();
        }}
        options={ACCESS_OPTIONS}
        disabled={pending}
      />
    </form>
  );
}

export function ProjectMembers({
  projectId,
  projectName,
  members,
  addable,
}: {
  projectId: number;
  projectName: string;
  members: Member[];
  addable: Candidate[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedUserId, setUserId] = useState(addable[0] ? String(addable[0].id) : "");
  const userId = addable.some((candidate) => String(candidate.id) === selectedUserId)
    ? selectedUserId
    : (addable[0] ? String(addable[0].id) : "");
  const [addState, addAction, adding] = useActionState<ProjectState, FormData>(addProjectMemberAction, { success: false });
  const [removeState, removeAction, removing] = useActionState<ProjectState, FormData>(removeProjectMemberAction, { success: false });

  useEffect(() => {
    if (addState.error) notify.error("Member not added", addState.error, `project-member-add-${projectId}`);
    if (addState.success) {
      notify.success("Member added", projectName, `project-member-add-${projectId}`);
      router.refresh();
    }
  }, [addState, projectId, projectName, router]);

  useEffect(() => {
    if (removeState.error) notify.error("Member not removed", removeState.error, `project-member-remove-${projectId}`);
    if (removeState.success) {
      notify.success("Member removed", projectName, `project-member-remove-${projectId}`);
      router.refresh();
    }
  }, [removeState, projectId, projectName, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Manage members of ${projectName}`}
          className="inline-flex items-center gap-1 underline"
        >
          <Users className="size-3.5" /> Members ({members.length})
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{projectName} — members</DialogTitle>
          <DialogDescription>
            Workspace role is inherited unless a project override is set. Read only can view,
            comment only can also comment, read &amp; write can change tasks, documents and files.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members yet.</p>
            ) : (
              members.map((member) => (
                <div key={member.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-ink bg-card px-3 py-2 text-sm shadow-[2px_2px_0_var(--ink)]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{member.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{member.email} · {member.role.toLowerCase()}</span>
                  </span>
                  <MemberAccess projectId={projectId} member={member} />
                  {member.isOwner ? (
                    <span className="chip chip-purple shrink-0">Owner</span>
                  ) : (
                    <form action={removeAction}>
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="userId" value={member.userId} />
                      <Button type="submit" variant="ghost" size="sm" disabled={removing}>Remove</Button>
                    </form>
                  )}
                </div>
              ))
            )}
          </div>

          {addable.length > 0 ? (
            <form action={addAction} className="space-y-2 border-t-2 border-ink pt-3">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="userId" value={userId} />
              <p className="text-xs font-extrabold uppercase">Add workspace member</p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-56 flex-1">
                  <SearchableSelect
                    id={`add-member-${projectId}`}
                    noClear
                    value={userId}
                    onChange={setUserId}
                    options={addable.map((candidate) => ({ value: String(candidate.id), label: `${candidate.name} · ${candidate.email}` }))}
                  />
                </div>
                <Button type="submit" size="sm" disabled={adding || !userId}>
                  <UserPlus className="mr-1.5 size-4" /> {adding ? "Adding…" : "Add"}
                </Button>
              </div>
            </form>
          ) : (
            <p className="border-t-2 border-ink pt-3 text-xs text-muted-foreground">
              Everyone in this workspace is already a member. Invite new people from Manage System → Users.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
