# Garmin Connect read-only bridge

One-shot pilot for Garmin Fenix 3 and Garmin CIRQA data already aggregated in the owner's Garmin Connect account. It reads daily wellness/activity summaries and sends only bounded metrics to the inactive n8n Garmin intake workflow.

Required secrets: `GARMIN_CONNECT_USERNAME`, `GARMIN_CONNECT_PASSWORD`, `GARMIN_DAILY_WEBHOOK_SECRET`. Required public configuration: `GARMIN_DAILY_WEBHOOK_URL`. Store the Garmin token directory on an encrypted persistent volume. Never commit credentials or token files.

Build with `docker compose -f compose.example.yml build`. Initialize the encrypted token volume once from an attached server terminal with `docker compose -f compose.example.yml run --rm nora-garmin-bridge python /app/bootstrap.py`; credentials and MFA are entered there, never in chat. Then start the daily 04:30 Europe/Bratislava scheduler with `docker compose -f compose.example.yml up -d`.

The first unattended run may stop with `GARMIN_MFA_REQUIRED` if bootstrap was skipped or the session expired. Repeat the interactive bootstrap and keep the resulting token volume. The bridge never writes to Garmin and must not be used for medical decisions.
