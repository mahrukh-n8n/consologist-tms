"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";

type Node = { id: number; level: number; title: string; body: string; children: Node[] };

function parseSections(markdown: string) {
  const lines = markdown.split("\n");
  const roots: Node[] = [];
  const stack: Node[] = [];
  const intro: string[] = [];
  let current: Node | null = null;
  let inFence = false;
  let nextId = 0;

  const flush = () => {
    if (current) current.body = current.body.trim();
  };

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const match = !inFence ? /^(#{1,6})\s+(.*)$/.exec(line) : null;
    if (match) {
      flush();
      const marker = match[1] ?? "#";
      const level = marker.length;
      const node: Node = { id: nextId++, level, title: (match[2] ?? "").trim(), body: "", children: [] };
      while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(node);
      else roots.push(node);
      stack.push(node);
      current = node;
      continue;
    }
    if (current) current.body += `${line}\n`;
    else intro.push(line);
  }
  flush();
  return { intro: intro.join("\n").trim(), roots };
}

export function MarkdownPreview({ markdown }: { markdown: string }) {
  const { intro, roots } = useMemo(() => parseSections(markdown), [markdown]);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const allParents = useMemo(() => {
    const ids = new Set<number>();
    const walk = (nodes: Node[]) => nodes.forEach((node) => { if (node.children.length) { ids.add(node.id); walk(node.children); } });
    walk(roots);
    return ids;
  }, [roots]);

  function toggle(id: number) {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id); else next.add(id);
    setCollapsed(next);
  }

  function render(nodes: Node[], depth = 0): React.ReactNode {
    return nodes.map((node) => {
      const folded = collapsed.has(node.id);
      return (
        <section key={node.id} className={depth === 0 ? "mt-4 first:mt-0" : "mt-3"}>
          <div className="flex items-start gap-1" style={{ marginLeft: depth * 16 }}>
            {node.children.length > 0 ? (
              <button
                type="button"
                id={`preview-toggle-${node.id}`}
                onClick={() => toggle(node.id)}
                aria-expanded={!folded}
                aria-label={`${folded ? "Expand" : "Collapse"} ${node.title}`}
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted"
              >
                {folded ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
              </button>
            ) : <span className="size-6 shrink-0" />}
            <div className="min-w-0 flex-1">
              <div className={`font-bold ${node.level === 1 ? "text-2xl" : node.level === 2 ? "text-xl" : node.level === 3 ? "text-lg" : "text-base"}`}>
                {node.title}
              </div>
              {!folded ? (
                <>
                  {node.body ? (
                    <div className="tms-prose mt-1 text-sm">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{node.body}</ReactMarkdown>
                    </div>
                  ) : null}
                  {node.children.length > 0 ? <div className="border-l border-border pl-3">{render(node.children, depth + 1)}</div> : null}
                </>
              ) : null}
            </div>
          </div>
        </section>
      );
    });
  }

  return (
    <div className="p-4">
      <div className="mb-2 flex flex-wrap gap-2">
        <button id="preview-expand-all" type="button" onClick={() => setCollapsed(new Set())} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-bold uppercase text-muted-foreground hover:bg-muted">
          <ChevronsUpDown className="size-3.5" /> Expand all
        </button>
        <button id="preview-collapse-all" type="button" onClick={() => setCollapsed(allParents)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-bold uppercase text-muted-foreground hover:bg-muted">
          <ChevronsDownUp className="size-3.5" /> Collapse all
        </button>
      </div>
      {intro ? <div className="tms-prose text-sm"><ReactMarkdown remarkPlugins={[remarkGfm]}>{intro}</ReactMarkdown></div> : null}
      {roots.length === 0 && !intro ? <p className="text-sm text-muted-foreground">Nothing to preview yet.</p> : render(roots)}
    </div>
  );
}
