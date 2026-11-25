import type { PageDefinition } from "@/modules/auth-rbac/types";

function normalizePath(path: string): string {
  return path.replace(/\/$/, "") || "/dashboard";
}

function pathMatches(cleanPath: string, candidatePath: string): boolean {
  const cleanCandidate = normalizePath(candidatePath);
  return cleanPath === cleanCandidate || cleanPath.startsWith(`${cleanCandidate}/`);
}

export function matchPageForPath(
  pages: PageDefinition[],
  pathname: string
): PageDefinition | null {
  const cleanPath = normalizePath(pathname);

  let bestMatch: { page: PageDefinition; matchedPathLength: number } | null = null;

  for (const page of pages) {
    for (const candidatePath of [page.path, ...(page.aliases ?? [])]) {
      if (!pathMatches(cleanPath, candidatePath)) continue;

      const matchedPathLength = normalizePath(candidatePath).length;
      if (!bestMatch || matchedPathLength > bestMatch.matchedPathLength) {
        bestMatch = { page, matchedPathLength };
      }
    }
  }

  return bestMatch?.page ?? null;
}
