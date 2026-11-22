# Owner-controlled Convex cutover

## Deployments

- Legacy live backend: `coordinated-mongoose-77.eu-west-1.convex.cloud`
- Owner-controlled production backend: `calm-alligator-455.eu-west-1.convex.cloud`
- Owner-controlled HTTP actions: `calm-alligator-455.eu-west-1.convex.site`

The legacy deployment remains the live rollback target until every cutover gate below passes. Never point the production frontend or n8n at the owner-controlled deployment merely because code deployment succeeded.

## Completed gates

- The full Convex schema and functions deploy from GitHub Actions.
- The production deploy key is limited to `deployment:deploy`.
- `OWNER_EMAIL`, `APP_NAME`, `JWT_PRIVATE_KEY`, and `JWKS` are configured.
- Public OIDC discovery and JWKS endpoints return HTTP 200.
- The one-time bootstrap workflow and key-generating script were removed after use.

## Remaining gates

1. Configure a newly rotated `N8N_INTEGRATION_SECRET` in the owner-controlled Convex and the encrypted n8n Header Auth credential.
2. Configure `PERSONAL_OPS_INTEGRATION_SECRET`, `AGENT_HANDOFF_SECRET`, and idea-vault ingestion credentials only for integrations that are enabled during cutover.
3. Rebuild the Chief of Staff snapshot in the new deployment from the authoritative n8n/Google sources. Do not treat an empty database as a successful migration.
4. Rehydrate native owner data that is not reproducible from source systems, including tasks, commands, decisions, projects, notes, habits, household records, and finance review state.
5. Run bounded read-only health checks against the new `.convex.site` endpoints and compare counts with the legacy deployment.
6. Deploy an independent frontend preview with `VITE_CONVEX_URL=https://calm-alligator-455.eu-west-1.convex.cloud` and Macaly authentication disabled.
7. Verify owner OTP login, Inbox Radar, calendars, NORA tasks, VERA notes, command lifecycle, health, household, and finance views in the preview.
8. Switch n8n writers first, observe one successful sync, then switch the frontend. Keep the legacy deployment unchanged during the rollback window.

## Rollback

If any gate fails, restore the frontend and n8n URLs to `coordinated-mongoose-77`, without deleting or modifying either database. Revoke temporary bootstrap credentials after the owner-controlled deployment is healthy; retain only the scoped GitHub production deploy key.
