import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownView({ markdown, className }: { markdown: string; className?: string }) {
  if (!markdown.trim()) return null;
  return (
    <div className={`tms-prose max-w-none text-sm ${className ?? ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  );
}
