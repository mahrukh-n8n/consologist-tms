---
description: "Reusable GUI rules for layout, details, grouped views, and redesign approval"
alwaysApply: true
---

# GUI design rules

## Keep pages easy to scan

- Put the information and actions people need most in the main view. Keep rows compact, use short labels, and remove text that repeats a nearby label or icon.
- Group related settings by task. Use clearly named tabs for distinct groups and let the content use the available width. Collapse advanced options and summarize what is configured.
- Show saved settings first. Open editing through a clear **Add** or **Edit** action. Keep the active context visible and link setup warnings directly to the affected fields or rows.
- Write control labels and help text in plain language. Describe what changes, when it takes effect, and what happens if the option is off when that matters.

## Show details on demand

- Keep the list in place. Use a compact, clearly labeled icon or count to show row type, multiple parts, or related records. Give icon-only controls accessible names.
- Open details on click or tap in a dialog or drawer that also works with the keyboard. Keep the user's place in the list when it closes.
- When a full detail page exists, offer a separate open-in-new-tab action with a distinct icon. Link to the top of that record. Use a link icon and count separately when showing a group of related records.

## Keep grouping optional

- Keep the established overall view as the default when adding an alternate grouping. Let the user select the grouped view explicitly.
- Treat display-only grouping as a change to row order and presentation. Keep individual rows, values, and overall totals intact.
- Put related rows together under a named heading. Use a subtle accent to help users scan groups and a labeled neutral group for unassigned rows. Use text alongside color to convey meaning.

## Review redesigns before replacing an existing view

- For a substantial redesign of an existing view, make the alternative available separately so the user can compare both. Keep the existing view available as the default until the user reviews and explicitly approves the replacement.
- Reuse shared data and actions across both views. If the preview can save changes, make clear that both views edit the same records.
- When the user asks for local review first, wait for their approval before committing or pushing the redesign. Approval to share a preview and approval to replace the original are separate decisions.
