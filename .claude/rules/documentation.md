---
description: "Documentation rules: htmldocs workflow, HelpLink, Content-Type routing, feature completion checklist"
alwaysApply: false
---

# Documentation Rules

## After Completing Any Feature

1. Verify feature is wired to GUI
2. Create/update end-user doc under `docs/htmldocs/` — Stripe/n8n style (what it does, how to use, inputs/outputs, errors)
3. No internal class names, source paths, or implementation details in docs
4. Update `docs/htmldocs/index.html` linking all feature docs
5. Add `HelpLink` (? icon) to each page that has a relevant doc
6. Add or update the `<div class="doc-timestamp">Last updated: YYYY-MM-DD</div>` element at the bottom of every page you create or modify — use today's date

## htmldocs Routing

Docs served in-app via `src/app/htmldocs/[...slug]/route.ts` at URL `/htmldocs/[filename]`.

The route MUST return correct `Content-Type` per file extension:
- `.css` -> `text/css`
- `.js` -> `application/javascript`
- `.html` -> `text/html`
- `.png` -> `image/png`

Never hardcode `text/html` for all files — CSS/images will silently break.

## Doc Location
Always `docs/htmldocs/`. NEVER create docs at root `./htmldocs/`.

Current docs: accounts.html, account-types.html, admin.html, currencies.html, getting-started.html, inventory.html, journal-entries.html, reports.html, settings-admin.html, tools.html, index.html.
