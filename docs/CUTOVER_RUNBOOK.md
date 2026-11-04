# SARA production cutover runbook

## Already verified

- Gmail, Drive and Telegram intake are active.
- Drive pilot processed a multi-document batch and retained ambiguous items for review.
- Bank PDF/CSV pairing and real CSV parsing passed read-only validation.
- NORA and SARA have separate active error monitoring.
- No production finance path uses Composio for routine n8n Google operations.

## Security rotation and deployment gate

Macaly confirmed on 2026-11-04 that the exposed deploy key was replaced on the existing `coordinated-mongoose-77` deployment and that the old key no longer works. Macaly also replaced `JWT_PRIVATE_KEY`/`JWKS`, `MACALY_API_TOKEN`, and `SECRET_KEY` without changing the deployment, database, user records, or application data.

Do not reuse the historical key. Before publishing or deploying:

1. replace `BILLDU_API_KEY` and `BILLDU_API_SECRET` with Billdu, revoke the old pair, and update both the deployment environment and Macaly `.env.local` without copying values into chat or Git,
2. generate a new `N8N_INTEGRATION_SECRET` and update both the deployment environment, Macaly `.env.local`, and the encrypted n8n Header Auth credential; do not leave either side on the exposed value,
3. reconnect the n8n `Google Drive account` OAuth credential and pass a read-only Drive check; its refresh token failed on 2026-11-03,
4. deploy the current Convex schema, actions and HTTP routes using only the rotated Macaly-managed deploy key,
5. run `npm run finance:preflight`; it is read-only and verifies endpoint authorization, the current bank/Billdu health schema, workflow states, placeholder absence, command attempt tokens and SARA error routing,
6. verify unauthenticated bank/review calls return 401,
7. inspect reported health issues without performing business writes,
8. run Billdu Read-only Probe `GYjLHpte4wi3g06L` once; verify only response field names/types and keep it inactive,
   then lock the real type/status/version mapping before connecting the prepared claim/complete endpoints to any Drive write,
9. backfill the six current review items,
10. run one review resolution twice and confirm one Drive file and one register row,
11. run one finance command twice and confirm exactly one register change, then run Finance Register Sync and verify the dashboard cache,
12. run the prepared real bank CSV import twice and confirm the second returns `ALREADY_IMPORTED`,
13. activate the review workflow and then the bank schedule,
14. activate Finance Health Monitor `2YGEEBjYBn8aNBsY` only after all monitored workflows pass,
15. publish Macaly only after dashboard, Drive, Sheets and Convex show the same state.

## Rollback

- Deactivate Finance Health Monitor, review and bank workflows first; keep the read-only Billdu probe inactive.
- Keep source files and register rows; do not delete evidence.
- Revert the Macaly publication only if the UI/backend deployment itself fails.
- NORA, Gmail, Drive and Telegram intake remain independent and must not be disabled during a bank/review rollback.
