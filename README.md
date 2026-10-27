# Chief of Staff HQ / SARA WOF Finance

Macaly project with a TanStack/React frontend and Convex backend. Macaly remains the product workspace and UI. The target production integration architecture uses n8n with native Google OAuth nodes for routine Gmail, Drive, Sheets, and Calendar operations; Composio is reserved for exceptional capabilities without a suitable direct connector.

The current branch still contains transitional Macaly/Composio calls. Keep the finance email cron disabled until the n8n cutover gates in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) pass.

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
- `WOF_FINANCE_EMAIL_CRON_ENABLED` (keep `false`; the target scheduler lives in n8n)

## Finance routing rules

- Incoming invoices are filed by the delivery/tax-point date read from the document.
- The email receipt date, file name, and subject never determine the accounting month.
- Bank and Stripe reports use the end of their explicit report period.
- Documents without trustworthy text or dates remain in the review queue and are not silently filed.
- Bank matches are proposals only. A payable is marked paid only after user confirmation.
