#!/usr/bin/env node
/**
 * Bounded TypeScript check.
 *
 * Why: a bare `tsc --noEmit` at the repo root walks generated output
 * (.next/**), the Prisma client and every script, which can appear to hang.
 * This wrapper uses a scoped project, an incremental cache and a memory cap,
 * and fails fast with an actionable message instead of blocking forever.
 *
 * Usage:
 *   node scripts/typecheck.mjs                 # scoped project (default)
 *   node scripts/typecheck.mjs --full          # legacy full tsconfig (not recommended)
 *   node scripts/typecheck.mjs --timeout 300   # seconds, default 240
 *   node scripts/typecheck.mjs --heap 4096     # MiB, default 4096
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: node scripts/typecheck.mjs [--full] [--timeout <seconds>] [--heap <MiB>]

  --full           use the root tsconfig.json (slow; diagnosis only)
  --timeout <s>    kill after this many seconds (default 240)
  --heap <MiB>     V8 old-space limit (default 4096)`);
  process.exit(0);
}
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const full = args.includes("--full");
const timeoutMs = Number(flag("--timeout", "240")) * 1000;
const heapMb = Number(flag("--heap", "4096"));
const project = full ? "tsconfig.json" : "tsconfig.typecheck.json";

const tsc = path.join(process.cwd(), "node_modules", "typescript", "bin", "tsc");
if (!existsSync(tsc)) {
  console.error("TypeScript is not installed. Run `npm install` first.");
  process.exit(1);
}
if (!existsSync(path.join(process.cwd(), project))) {
  console.error(`Missing ${project}.`);
  process.exit(1);
}

console.log(`[typecheck] project=${project} heap=${heapMb}MiB timeout=${timeoutMs / 1000}s`);
const started = Date.now();
const child = spawn(process.execPath, [tsc, "-p", project, "--noEmit", "--pretty", "false"], {
  stdio: "inherit",
  env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=${heapMb}`.trim() },
});

const timer = setTimeout(() => {
  child.kill("SIGKILL");
  console.error(`
[typecheck] TIMEOUT after ${Math.round((Date.now() - started) / 1000)}s.

Likely causes and fixes:
  1. Old build output is being scanned. Run: rm -rf .next/cache/tsconfig.*.tsbuildinfo
  2. A recursive/conditional type or an oversized union in new code. Bisect by
     running with a narrow include, then widen.
  3. Generated Prisma client is stale. Run: npx prisma generate
  4. The full project is genuinely large. Use feature-scoped tsconfigs
     (see .claude/rules/typecheck.md) and NODE_OPTIONS=--max-old-space-size=1280
     for the narrow scope.

Re-run with a longer bound only after checking 1-3: npm run typecheck -- --timeout 600
`);
  process.exit(124);
}, timeoutMs);

child.on("exit", (code) => {
  clearTimeout(timer);
  const seconds = Math.round((Date.now() - started) / 1000);
  if (code === 0) {
    console.log(`[typecheck] OK in ${seconds}s`);
  } else {
    console.error(`[typecheck] FAILED (exit ${code}) in ${seconds}s`);
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  clearTimeout(timer);
  console.error(`[typecheck] failed to start tsc: ${error.message}`);
  process.exit(1);
});
