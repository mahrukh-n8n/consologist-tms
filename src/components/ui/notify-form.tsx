"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { MarkdownField } from "@/components/documents/markdown-field";
import { notify } from "@/lib/notifications/client";

export type FormField =
  | { kind: "text" | "email" | "password" | "number" | "datetime-local" | "color" | "hidden"; name: string; label?: string; required?: boolean; defaultValue?: string; placeholder?: string; className?: string }
  | { kind: "textarea"; name: string; label: string; required?: boolean; placeholder?: string }
  | { kind: "markdown"; name: string; label: string; defaultValue?: string; placeholder?: string }
  | { kind: "select"; name: string; label: string; options: { value: string; label: string }[]; required?: boolean; defaultValue?: string; noClear?: boolean; className?: string };

type State = { success: boolean; error?: string };

export function NotifyForm({
  action,
  fields,
  submitLabel,
  successTitle,
  successDetail,
  errorTitle,
  actionId,
  className,
}: {
  action: (prev: State, formData: FormData) => Promise<State>;
  fields: FormField[];
  submitLabel: string;
  successTitle: string;
  successDetail?: string;
  errorTitle: string;
  actionId: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { success: false });
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.error) notify.error(errorTitle, state.error, actionId);
    if (state.success) {
      notify.success(successTitle, successDetail, actionId);
      formRef.current?.reset();
    }
  }, [state, actionId, errorTitle, successDetail, successTitle]);

  return (
    <form ref={formRef} action={formAction} className={className ?? "flex flex-wrap items-end gap-3"}>
      {fields.map((field) =>
        field.kind === "select" ? (
          <SelectField key={field.name} field={field} idPrefix={actionId} />
        ) : field.kind === "markdown" ? (
          <div key={field.name} className="w-full">
            <MarkdownField
              name={field.name}
              label={field.label}
              defaultValue={field.defaultValue}
              placeholder={field.placeholder}
              id={`${actionId}-${field.name}`}
            />
          </div>
        ) : field.kind === "textarea" ? (
          <div key={field.name} className="w-full space-y-1">
            <Label htmlFor={`${actionId}-${field.name}`}>{field.label}</Label>
            <textarea
              id={`${actionId}-${field.name}`}
              name={field.name}
              required={field.required}
              placeholder={field.placeholder}
              className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
        ) : field.kind === "hidden" ? (
          <input key={field.name} type="hidden" name={field.name} defaultValue={field.defaultValue} />
        ) : (
          <div key={field.name} className={field.className ?? "space-y-1"}>
            {field.label ? <Label htmlFor={`${actionId}-${field.name}`}>{field.label}</Label> : null}
            <Input
              id={`${actionId}-${field.name}`}
              name={field.name}
              type={field.kind}
              required={field.required}
              defaultValue={field.defaultValue}
              placeholder={field.placeholder}
            />
          </div>
        )
      )}
      <Button id={`${actionId}-submit`} type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
    </form>
  );
}

function SelectField({
  field,
  idPrefix,
}: {
  field: Extract<FormField, { kind: "select" }>;
  idPrefix: string;
}) {
  const [value, setValue] = useState(field.defaultValue ?? field.options[0]?.value ?? "");
  return (
    <div className={field.className ?? "space-y-1"}>
      <Label htmlFor={`${idPrefix}-${field.name}`}>{field.label}</Label>
      <SearchableSelect
        id={`${idPrefix}-${field.name}`}
        value={value}
        onChange={setValue}
        options={field.options}
        noClear={field.noClear ?? field.required}
      />
      <input type="hidden" name={field.name} value={value} />
    </div>
  );
}
