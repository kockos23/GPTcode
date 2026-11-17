# Chief of Staff — operations runbook

## Production data flow

The dashboard reads a bounded Convex snapshot. `NORA — Chief of Staff Snapshot Sync` reads the Control Center Google Sheet through native Google OAuth at 07:05 and 17:05 Europe/Bratislava and writes it to the authenticated endpoint `/integrations/n8n/chief-of-staff/snapshot`.

Dashboard-created tasks and commands are written directly to Convex and merged with the imported snapshot by stable IDs. They therefore remain visible even when Google Sheets is temporarily unavailable. Agent task approvals update the cached work queue atomically. A later worker may mirror these native records back to Sheets, but Sheets is no longer on the synchronous user-action path.

Until the first successful production sync, the old Macaly/Composio read path remains a fallback. Remove it only after the Convex snapshot has been populated and the dashboard has passed a live read test.

## Workflows

- `NORA — Chief of Staff Snapshot Sync`: Control Center snapshot at 07:05 and 17:05.
- `NORA — Chief of Staff Health Monitor`: freshness check at 07:45 and 17:45.
- Both workflows use NORA's dedicated error monitor `kGkyEMhtp7qdGtFI`, keep error executions, discard successful payloads and have a 15-minute timeout.
- Keep both inactive until the matching Convex endpoints have been deployed.

The health endpoint returns HTTP 503 when no snapshot exists or its last source sync is more than 26 hours old. This intentionally fails the n8n health execution so NORA sends an alert.

## Controlled cutover

1. Deploy the Convex schema and functions.
2. Run the snapshot workflow manually once while inactive.
3. Confirm HTTP 200 and a non-empty Agent Registry in the dashboard.
4. Confirm dashboard task creation survives a refresh.
5. Activate Snapshot Sync.
6. Run Health Monitor manually and confirm HTTP 200, then activate it.
7. Review n8n execution metadata after the next scheduled cycle.
8. Only then remove the Macaly/Composio fallback from `convex/liveBriefing.ts`.

## Live Gmail and Calendar sources

Since 17 November 2026 the snapshot workflow reads the owner's unread Gmail messages from the previous seven days (excluding promotions, social and forum categories) and the next fourteen days from the primary Google Calendar. Gmail, Calendar and Control Center Sheets use separate NORA credentials under the owner's account. The controlled live run wrote 50 bounded email items, 4 calendar events, 17 agents and 3 tasks to Convex with no source errors.

## Recovery

If snapshot sync fails, the dashboard continues serving the last successful bounded snapshot and native Convex tasks/commands. Check the NORA Telegram alert, then the failed n8n node. Do not clear the snapshot as a recovery step. Re-run the sync after fixing Google OAuth or network access; upsert semantics replace the primary snapshot without duplicating it.
