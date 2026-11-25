# TypeScript checks — bounded and scoped

Adapted from the Consologist Accountant pattern: scoped tsconfig projects and an explicit memory bound instead of one unbounded root check.

## Default command

```bash
npm run typecheck          # scoped, incremental, 4 GiB heap, 240 s timeout
npm run typecheck:full    # legacy root tsconfig — diagnosis/release only
```

`npm run typecheck` uses `tsconfig.typecheck.json` and `scripts/typecheck.mjs`.

## Why a bare `tsc --noEmit` can appear to hang

The root `tsconfig.json` includes `**/*.ts` and `**/*.tsx`, so it walks:

- `.next/**` generated route/type output
- `src/generated/prisma/**` (large generated client)
- `scripts/**`, `prisma.config.ts`, test fixtures

That is unnecessary for a feature check and can look hung on a cold cache.

## Rules

1. Never use bare `tsc --noEmit` for routine checks. Use `npm run typecheck`.
2. Keep `tsconfig.typecheck.json` narrow: `next-env.d.ts`, `src/**`, and `.next/types`. Exclude `.next/cache`, `.next/standalone`, `.next/static`, `.next/server`.
3. For a feature-scoped check, create `tsconfig.<feature>.json` that extends `tsconfig.json` with:
   - `"incremental": false`
   - `include` limited to the feature paths plus `next-env.d.ts`
   - `NODE_OPTIONS=--max-old-space-size=1280 npx tsc -p tsconfig.<feature>.json`
   Follow `tsconfig.profit-dashboard.json` in the accountant app as the reference shape.
4. Treat a timeout as a signal, not a reason to raise the limit:
   - delete stale cache: `rm -rf .next/cache/tsconfig.*.tsbuildinfo`
   - regenerate: `npx prisma generate`
   - bisect the include list; look for recursive conditional types, huge unions, or generated files
5. Only increase `--timeout`/`--heap` after clearing stale cache and confirming the scope is intentional.
6. CI and pre-merge checks run `npm run typecheck`; the full check is not a substitute for a scoped failure.

## Verification

- `npm run typecheck` must print `[typecheck] OK in …s`.
- If it fails, fix the reported file; do not suppress with `// @ts-ignore` without a written reason.
