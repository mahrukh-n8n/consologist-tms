"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TagInput({
  name = "tags",
  id = "tags",
  defaultValue = [],
  suggestions = [],
  placeholder = "Type a tag and press Enter",
}: {
  name?: string;
  id?: string;
  defaultValue?: string[];
  suggestions?: string[];
  placeholder?: string;
}) {
  const [tags, setTags] = useState<string[]>(defaultValue);
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const title = raw.trim().replace(/,$/, "");
    if (!title) return;
    setTags((current) => (current.some((tag) => tag.toLowerCase() === title.toLowerCase()) ? current : [...current, title]));
    setDraft("");
  };
  const remove = (title: string) => setTags((current) => current.filter((tag) => tag !== title));
  const unused = suggestions.filter((tag) => !tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())).slice(0, 6);

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={tags.join(",")} />
      <div className="flex flex-wrap gap-1.5 empty:hidden">
        {tags.map((tag) => (
          <span key={tag} className="chip chip-cyan">
            {tag}
            <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => remove(tag)}>
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add(draft);
            }
            if (event.key === "Backspace" && draft === "" && tags.length > 0) remove(tags[tags.length - 1]!);
          }}
          onBlur={() => add(draft)}
          placeholder={placeholder}
        />
        <Button
          size="icon"
          variant="accent"
          type="button"
          aria-label="Add tag"
          onClick={() => add(draft)}
          className="shrink-0"
        >
          <Plus className="size-4" />
        </Button>
      </div>
      {unused.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Reuse:</span>
          {unused.map((tag) => (
            <button key={tag} type="button" className="chip chip-paper" onClick={() => add(tag)}>{tag}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
