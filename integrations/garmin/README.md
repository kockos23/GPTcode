# Garmin Connect read-only bridge

One-shot pilot for Garmin Fenix 3 and Garmin CIRQA data already aggregated in the owner's Garmin Connect account. It reads daily wellness/activity summaries and sends only bounded metrics to the inactive n8n Garmin intake workflow.

Required secrets: `GARMIN_CONNECT_USERNAME`, `GARMIN_CONNECT_PASSWORD`, `GARMIN_DAILY_WEBHOOK_SECRET`. Required public configuration: `GARMIN_DAILY_WEBHOOK_URL`. Store the Garmin token directory on an encrypted persistent volume. Never commit credentials or token files.

The first run may stop with `GARMIN_MFA_REQUIRED`. Complete MFA interactively in the approved runtime, persist the resulting Garmin token store, then schedule the script once daily. The bridge never writes to Garmin and must not be used for medical decisions.
