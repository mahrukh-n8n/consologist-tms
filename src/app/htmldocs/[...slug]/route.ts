import { readFile } from "node:fs/promises";
import path from "node:path";

const guides = ["index.html", "documents.html"];
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return guides.map((name) => ({ slug: [name] }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const name = (await params).slug.join("/");
  if (!guides.includes(name)) return new Response(null, { status: 404 });
  const html = await readFile(path.join(process.cwd(), "docs", "htmldocs", name), "utf8");
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
