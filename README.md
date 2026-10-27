# Chief of Staff HQ / SARA WOF Finance

Macaly project with a TanStack/React frontend and Convex backend. Macaly remains the primary runtime and supplies the protected Google/Composio integrations.

## Local validation

```bash
npm ci
npm test
npx tsc --noEmit
npm run build
```

The production build does not prove that live Gmail, Drive, Sheets, Convex authentication, or scheduled jobs work. Validate those integrations in the Macaly pilot environment using `docs/OPERATIONS.md`.

## Runtime configuration

Macaly/Convex already manage the secret values used by the project. Never commit their values. The code expects these variable names:

- `VITE_CONVEX_URL`
- `CONVEX_SITE_URL`
- `OWNER_EMAIL`
- `MACALY_BASE_URL`
- `MACALY_API_TOKEN`
- `MACALY_CHAT_ID`
- `MACALY_BYPASS_HEADER` (optional)
- `OTP_ENDPOINT`, `CHAT_ID`, `APP_NAME`, `SECRET_KEY`
- `WOF_FINANCE_GMAIL_QUERY` (optional; defaults to the `WOF_FINANCE_INTAKE` Gmail label)
- `WOF_FINANCE_EMAIL_CRON_ENABLED` (`true` only after the pilot succeeds)

## Finance routing rules

- Incoming invoices are filed by the delivery/tax-point date read from the document.
- The email receipt date, file name, and subject never determine the accounting month.
- Bank and Stripe reports use the end of their explicit report period.
- Documents without trustworthy text or dates remain in the review queue and are not silently filed.
- Bank matches are proposals only. A payable is marked paid only after user confirmation.
