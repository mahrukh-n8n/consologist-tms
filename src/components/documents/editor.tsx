"use client";

import { useId, useState } from "react";
import { Code2, Eye, ListTree } from "lucide-react";
import { MarkdownPreview } from "./markdown-preview";
import {
  MDXEditor,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  CreateLink,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  Separator,
  UndoRedo,
  codeBlockPlugin,
  codeMirrorPlugin,
  headingsPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import "./document-style.css";

export interface MarkdownEditorProps {
  markdown: string;
  onChange: (markdown: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  minHeight?: number;
  showSourceToggle?: boolean;
}

export default function MarkdownEditor({
  markdown,
  onChange,
  readOnly = false,
  placeholder = "Start writing…",
  minHeight = 180,
  showSourceToggle = true,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<"formatted" | "markdown" | "preview">("formatted");
  const toggleId = useId();

  if (mode === "preview") {
    return (
      <div className="tms-markdown-editor rounded-xl border border-border bg-card" style={{ ["--tms-min-height" as string]: `${minHeight}px` }}>
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted px-2 py-1.5">
          <span className="text-[11px] font-bold uppercase text-muted-foreground">Preview · collapsible headings</span>
          <div className="flex gap-1">
            <button type="button" onClick={() => setMode("formatted")} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold uppercase hover:bg-background" aria-label="Show formatted editor">
              <Eye className="size-3.5" /> Formatted
            </button>
            <button type="button" onClick={() => setMode("markdown")} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold uppercase hover:bg-background" aria-label="Show markdown source">
              <Code2 className="size-3.5" /> Markdown
            </button>
          </div>
        </div>
        <div style={{ minHeight }}><MarkdownPreview markdown={markdown} /></div>
      </div>
    );
  }

  if (mode === "markdown") {
    return (
      <div className="tms-markdown-editor rounded-xl border border-border bg-card" style={{ ["--tms-min-height" as string]: `${minHeight}px` }}>
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted px-2 py-1.5">
          <span className="text-[11px] font-bold uppercase text-muted-foreground">Markdown source</span>
          {showSourceToggle ? (
            <button type="button" onClick={() => setMode("formatted")} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold uppercase hover:bg-background" aria-label="Show formatted view" data-editor-toggle={toggleId}>
              <Eye className="size-3.5" /> Formatted
            </button>
          ) : null}
        </div>
        <textarea
          value={markdown}
          onChange={(event) => onChange(event.target.value)}
          readOnly={readOnly}
          placeholder={placeholder}
          spellCheck={false}
          className="block w-full resize-y bg-card p-4 font-mono text-sm leading-6 outline-none"
          style={{ minHeight }}
          aria-label="Markdown source"
        />
      </div>
    );
  }

  return (
    <div className="tms-markdown-editor rounded-xl border border-border bg-card" style={{ ["--tms-min-height" as string]: `${minHeight}px` }}>
      {showSourceToggle ? (
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted px-2 py-1.5">
          <span className="text-[11px] font-bold uppercase text-muted-foreground">Formatted</span>
          <div className="flex gap-1">
            <button type="button" onClick={() => setMode("preview")} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold uppercase hover:bg-background" aria-label="Show collapsible preview">
              <ListTree className="size-3.5" /> Preview
            </button>
            <button type="button" onClick={() => setMode("markdown")} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold uppercase hover:bg-background" aria-label="Show markdown source" data-editor-toggle={toggleId}>
              <Code2 className="size-3.5" /> Markdown
            </button>
          </div>
        </div>
      ) : null}
      <MDXEditor
        markdown={markdown}
        onChange={onChange}
        readOnly={readOnly}
        placeholder={placeholder}
        contentEditableClassName="portfolio-document-prose tms-prose"
        className="tms-mdx"
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          tablePlugin(),
          codeBlockPlugin({ defaultCodeBlockLanguage: "" }),
          codeMirrorPlugin({ codeBlockLanguages: { "": "Text", js: "JavaScript", ts: "TypeScript", json: "JSON", bash: "Bash", python: "Python" } }),
          markdownShortcutPlugin(),
          toolbarPlugin({
            toolbarContents: () => (
              <>
                <UndoRedo />
                <Separator />
                <BoldItalicUnderlineToggles />
                <BlockTypeSelect />
                <ListsToggle />
                <CreateLink />
                <InsertTable />
                <InsertThematicBreak />
              </>
            ),
          }),
        ]}
      />
    </div>
  );
}
