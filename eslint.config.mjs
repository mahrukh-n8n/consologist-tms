import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  // ── MCP Module Portability Boundary ──────────────────────────────────────────
  // src/modules/mcp/** must have ZERO runtime imports from app business logic or
  // Next.js runtime APIs. This keeps the portable module extractable by copy.
  // Tool implementations live in src/lib/mcp/tools/* (app-side).
  {
    files: ["src/modules/mcp/**/*.ts", "src/modules/mcp/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/*", "@/lib/**"],
              message:
                "src/modules/mcp is portable — app business logic must not be imported here. Implement tool handlers in src/lib/mcp/tools/* instead.",
            },
            {
              group: ["@/app/*", "@/app/**"],
              message:
                "src/modules/mcp is portable — Next.js app routes must not be imported here.",
            },
            {
              group: ["@/components/*", "@/components/**"],
              message:
                "src/modules/mcp is portable — React components must not be imported here.",
            },
            {
              group: ["next/*", "next/**"],
              message:
                "src/modules/mcp is portable — Next.js built-ins (next/headers, next/cache, etc.) must not be imported here. The module runs as a standalone stdio subprocess.",
            },
            {
              group: ["server-only"],
              message:
                "src/modules/mcp is portable — server-only is a Next.js guard and must not be used here.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // GSD tooling (not project code)
    ".claude/**",
    ".planning/**",
  ]),
]);

export default eslintConfig;
