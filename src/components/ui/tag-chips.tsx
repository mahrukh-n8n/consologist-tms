"use client";

import { useState, useRef, useCallback } from "react";
import { X, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface TagItem {
  id: number;
  tag: string;
}

interface TagChipsProps {
  tags: TagItem[];
  onAdd: (tag: string) => Promise<void>;
  onRemove: (tagId: number) => Promise<void>;
  onSearch: (query: string) => Promise<string[]>;
  entityLabel?: string;
}

export function TagChips({ tags, onAdd, onRemove, onSearch, entityLabel = "entity" }: TagChipsProps) {
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingAdd, setLoadingAdd] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInputChange = useCallback(
    (value: string) => {
      setInputValue(value);
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      searchTimeout.current = setTimeout(async () => {
        const results = await onSearch(value);
        setSuggestions(results);
      }, 200);
    },
    [onSearch],
  );

  const handleAdd = async (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    setLoadingAdd(true);
    try {
      await onAdd(trimmed);
    } finally {
      setLoadingAdd(false);
      setInputValue("");
      setSuggestions([]);
      setShowInput(false);
    }
  };

  const handleRemove = async (tagId: number) => {
    setRemovingId(tagId);
    try {
      await onRemove(tagId);
    } finally {
      setRemovingId(null);
    }
  };

  const openInput = () => {
    setShowInput(true);
    onSearch("").then(setSuggestions);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const closeInput = () => {
    setShowInput(false);
    setInputValue("");
    setSuggestions([]);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <Badge key={t.id} variant="secondary" className="gap-1 pr-1 text-xs">
          {t.tag}
          <button
            onClick={() => handleRemove(t.id)}
            disabled={removingId === t.id}
            aria-label={`Remove tag ${t.tag} from ${entityLabel}`}
            className="ml-0.5 rounded-sm opacity-60 hover:opacity-100 disabled:opacity-30"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}

      {showInput ? (
        <div className="relative flex items-center gap-1">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd(inputValue);
              if (e.key === "Escape") closeInput();
            }}
            onBlur={() => {
              // Delay close to allow suggestion click to fire first
              setTimeout(closeInput, 150);
            }}
            placeholder="Add tag..."
            className="h-6 w-32 text-xs px-2 py-0"
            disabled={loadingAdd}
            aria-label={`Add tag to ${entityLabel}`}
          />
          {suggestions.length > 0 && (
            <div className="absolute top-7 left-0 z-50 max-h-40 w-44 overflow-auto rounded-md border bg-popover shadow-md">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleAdd(s);
                  }}
                  className="w-full px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={openInput}
          className="h-6 gap-1 px-1.5 text-xs text-muted-foreground hover:text-foreground"
          aria-label={`Add tag to ${entityLabel}`}
        >
          <Plus className="h-3 w-3" />
          Add tag
        </Button>
      )}
    </div>
  );
}
