---
description: Shared success, error and warning feedback for all app actions
alwaysApply: true
---

# Action notifications

- Use `notify` from `@/lib/notifications/client` for every user-triggered save, fetch, upload, delete, confirmation or other async action in new or modified GUI flows. Do not create another toast system, window alert, or page-specific notification class.
- `NotificationService` is the shared service. The root layout mounts exactly one `Toaster`; never mount another in a page or dialog.
- Show errors through `notify.error(actionTitle, actionableMessage, actionId)`, including returned validation errors and caught network failures. Inline errors may remain for context, but must not be the only feedback on long pages. Native form validation must also surface a notice.
- Show `notify.success` only after the server confirms the write or successful fetch. “Picture added to form” is `notify.info`, not “Picture saved”. Partial results use `notify.warning` and say what succeeded and what remains unavailable.
- Reuse a stable ID for each action so retry results replace its prior notice. Errors/warnings remain until dismissed; successes close after five seconds. Keep these policies in the shared service.
- Preserve draft values on failure. Keep fields enabled after completion, retain existing permission gates, and never perform automatic retries or writes from a notice.
- Client consumers must receive a confirmed result before showing success. For navigation after saves, return an explicit destination and navigate after emitting the notice; do not swallow framework redirect exceptions as failures.
- Use short sentence-case action titles, readable details, and existing semantic status colors. Do not rely on color alone. Maintain keyboard dismissal, screen-reader announcements, reduced-motion support and mobile-safe bottom-right positioning.
- Test returned validation errors, thrown errors, success, partial success and persistence after navigation where applicable. Do not claim every legacy page is migrated merely because the shared viewport exists.
