# SARA secret rotation runbook

This runbook covers the project-owned secrets that were readable through the historical Convex deploy key. Macaly confirmed on 2026-11-04 that the deploy key and all Macaly-managed secrets were replaced. Never paste replacement values into chat, Git, tickets, screenshots, logs, or workflow JSON.

## Current gate

Do not deploy Convex or activate additional finance workflows until every item below is complete. Existing Gmail, Drive, and Telegram intake workflows must not receive new documents until the shared Google Drive OAuth credential is healthy.

## 1. Restore the active Google Drive connection

This is an availability repair, not part of the key exposure. In n8n, reconnect the existing credential named `Google Drive account` to the same WOF Google identity. Do not create a second credential unless reconnecting the existing one is impossible.

Acceptance checks:

- the credential connection test succeeds;
- a read-only list of `01_NA_SPRACOVANIE` succeeds;
- no document is moved, uploaded, renamed, or registered during the check;
- `npm run finance:audit` shows no new Drive authorization error after the repair. Historical errors remain visible until they age out of the seven-day audit window.

Do not retry execution `525`: it failed while listing the folder before reading or changing a document. The next scheduled run safely performs a fresh list.

## 2. Rotate Billdu credentials

Rotate at the Billdu provider:

- `BILLDU_API_KEY`
- `BILLDU_API_SECRET`

Store the new pair in both locations that Macaly identified:

1. the `coordinated-mongoose-77` deployment environment;
2. the Chief of Staff HQ Macaly `.env.local`.

Do not store Billdu credentials in n8n. Revoke the former pair with Billdu and do not retain a plaintext copy. The first verification call after deployment is the bounded, manual, read-only Billdu probe described in `docs/BILLDU_CUTOVER.md`; it must not download PDFs or write to Drive/Sheets.

## 3. Rotate the n8n integration secret

Generate a new high-entropy value locally in a password manager. Replace `N8N_INTEGRATION_SECRET` in all three locations before endpoint testing:

1. the `coordinated-mongoose-77` deployment environment;
2. the Chief of Staff HQ Macaly `.env.local`;
3. the existing encrypted n8n Header Auth credential used by the Convex integration workflows.

Do not create one secret per workflow. Every prepared Convex integration workflow intentionally uses the same restricted Header Auth credential. This value is not the n8n API key and must never be placed in `N8N_API_KEY`.

## 4. Pre-deployment verification

Verify names and presence only; never print values.

- Billdu pair is present in the deployment and `.env.local`.
- Integration secret is present in the deployment, `.env.local`, and n8n credential store.
- Google Drive OAuth reconnect passed its read-only check.
- `VITE_CONVEX_URL` and `CONVEX_SITE_URL` are the public URLs for `coordinated-mongoose-77`; they are not secrets.
- Repository and sanitized n8n exports contain no credential values.

Then follow `docs/CUTOVER_RUNBOOK.md`. After Convex deployment, `npm run finance:preflight` verifies authenticated endpoint behavior without business writes. A successful build alone is not proof that any external integration works.

## Handoff record

Record only completion state and provider timestamps, never values:

| Item | Completion evidence |
| --- | --- |
| Drive OAuth | read-only folder list succeeded; time recorded |
| Billdu pair | provider rotation/revocation confirmed; both Macaly locations updated |
| n8n integration secret | both Macaly locations and encrypted n8n credential updated |
| Convex deployment | current schema/routes deployed to the existing deployment |
| Preflight | command result and time recorded, with no secret output |
