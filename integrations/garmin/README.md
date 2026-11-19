# Garmin Connect read-only bridge

One-shot pilot for Garmin Fenix 3 and Garmin CIRQA data already aggregated in the owner's Garmin Connect account. It reads daily wellness/activity summaries and sends only bounded metrics to the inactive n8n Garmin intake workflow.

Required long-running secret: `GARMIN_DAILY_WEBHOOK_SECRET`. Required public configuration: `GARMIN_DAILY_WEBHOOK_URL`. `GARMIN_CONNECT_USERNAME` and `GARMIN_CONNECT_PASSWORD` are needed only during the interactive bootstrap and should be removed from `.env.garmin` afterwards. Store the Garmin token directory on an encrypted persistent volume. Never commit credentials or token files.

Copy `.env.garmin.example` to `.env.garmin` on the VPS, set file mode `600`, and fill the n8n webhook URL and a unique secret. Run `./preflight.sh`; it validates configuration without printing secret values. Build with `docker compose --env-file .env.garmin -f compose.example.yml build`. Initialize the encrypted token volume once from an attached server terminal with `docker compose --env-file .env.garmin -f compose.example.yml run --rm nora-garmin-bridge python /app/bootstrap.py`; credentials and MFA are entered there, never in chat. Remove the username and password lines from `.env.garmin`, run the preflight again, and execute a one-day pilot with `docker compose --env-file .env.garmin -f compose.example.yml run --rm nora-garmin-bridge python /app/bridge.py`. Only after that succeeds, start the daily 04:30 Europe/Bratislava scheduler with `docker compose --env-file .env.garmin -f compose.example.yml up -d`.

Useful read-only checks after startup:

```bash
docker compose --env-file .env.garmin -f compose.example.yml ps
docker compose --env-file .env.garmin -f compose.example.yml logs --tail=50 nora-garmin-bridge
```

Rollback stops the scheduler without deleting the token volume:

```bash
docker compose --env-file .env.garmin -f compose.example.yml stop nora-garmin-bridge
```

Do not use `down -v`; `-v` would delete the persisted Garmin token volume and force a new interactive login.

The first unattended run may stop with `GARMIN_MFA_REQUIRED` if bootstrap was skipped or the session expired. Repeat the interactive bootstrap and keep the resulting token volume. The bridge never writes to Garmin and must not be used for medical decisions.
