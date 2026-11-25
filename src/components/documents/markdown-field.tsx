"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Label } from "@/components/ui/label";

const MarkdownEditor = dynamic(() => import("./editor"), {
  ssr: false,
  loading: () => <div className="rounded-xl border border-border bg-muted/40 p-6 text-sm text-muted-foreground">Loading editor…</div>,
});

export function MarkdownField({
  name,
  label,
  defaultValue = "",
  placeholder,
  id,
  minHeight = 180,
}: {
  name: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  id?: string;
  minHeight?: number;
}) {
  const [value, setValue] = useState(defaultValue);
  const editorId = id ?? `markdown-${name}`;
  return (
    <div className="space-y-1.5">
      {label ? <Label htmlFor={editorId}>{label}</Label> : null}
      <input type="hidden" name={name} value={value} />
      <div id={editorId}>
        <MarkdownEditor markdown={value} onChange={setValue} placeholder={placeholder} minHeight={minHeight} />
      </div>
    </div>
  );
}
