# SARA production cutover runbook

## Already verified

- Gmail, Drive and Telegram intake are active.
- Drive pilot processed a multi-document batch and retained ambiguous items for review.
- Bank PDF/CSV pairing and real CSV parsing passed read-only validation.
- NORA and SARA have separate active error monitoring.
- No production finance path uses Composio for routine n8n Google operations.

## Blocked until Macaly rotates the exposed deploy key

Do not publish or deploy with the exposed key. After Macaly confirms rotation:

1. confirm `.env.local` was updated without copying the key into chat,
2. confirm the existing `N8N_INTEGRATION_SECRET` is present in Macaly/Convex and the matching value remains in the encrypted n8n Header Auth credential; do not rotate it unless it was exposed,
3. deploy the current Convex schema, actions and HTTP routes,
4. run `npm run finance:preflight`; it is read-only and verifies endpoint authorization, authenticated health schema, workflow states, placeholder absence and SARA error routing,
5. verify unauthenticated bank/review calls return 401,
6. inspect reported health issues without performing business writes,
7. run Billdu Read-only Probe `GYjLHpte4wi3g06L` once; verify only response field names/types and keep it inactive,
   then lock the real type/status/version mapping before connecting the prepared claim/complete endpoints to any Drive write,
8. backfill the six current review items,
9. run one review resolution twice and confirm one Drive file and one register row,
10. run one finance command twice and confirm exactly one register change, then run Finance Register Sync and verify the dashboard cache,
11. run the prepared real bank CSV import twice and confirm the second returns `ALREADY_IMPORTED`,
12. activate the review workflow and then the bank schedule,
13. activate Finance Health Monitor `2YGEEBjYBn8aNBsY` only after all monitored workflows pass,
14. publish Macaly only after dashboard, Drive, Sheets and Convex show the same state.

## Rollback

- Deactivate Finance Health Monitor, review and bank workflows first; keep the read-only Billdu probe inactive.
- Keep source files and register rows; do not delete evidence.
- Revert the Macaly publication only if the UI/backend deployment itself fails.
- NORA, Gmail, Drive and Telegram intake remain independent and must not be disabled during a bank/review rollback.
