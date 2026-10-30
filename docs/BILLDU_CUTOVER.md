# Billdu → SARA integration contract

## Goal

Issued invoices from Billdu must arrive in the existing WOF finance system without a second dashboard or Composio. n8n is the integration layer, Drive stores the PDF original, Sheets keeps the operational register and Convex/Macaly provides status and review.

## Required Billdu capability check

Before implementation, verify in the current Billdu plan whether it provides one of these supported mechanisms:

1. webhook for invoice created/updated/paid with a follow-up API call for invoice detail and PDF, or
2. read-only invoice API with `updated since` filtering and PDF download, or
3. scheduled export delivered to the dedicated finance mailbox as a fallback.

Do not assume endpoint names, token format or plan availability. Capture only a screenshot of Billdu **Settings → API / Integrations / Webhooks** without displaying a token.

## Canonical invoice payload

n8n must normalize the Billdu response to these fields before any write:

- `source = billdu`
- stable `sourceInvoiceId`
- invoice number
- issue date
- delivery/date-of-supply date
- due date
- customer name and identifiers
- net, VAT and total amounts
- ISO currency
- invoice status and payment status
- source URL and immutable PDF bytes
- source update timestamp

Missing invoice ID, delivery date, total, currency or PDF blocks automatic filing and creates a review event.

## Idempotency and routing

- `documentId = billdu:<sourceInvoiceId>` is the stable key. Updating an invoice must update the same record, never append a second accounting document.
- Drive destination is `YYYY-MM/Vystavene_FA`, derived from the explicit delivery/date-of-supply date—not creation, email or synchronization time.
- PDF filename follows the existing safe convention: `deliveryDate_customer_invoiceNumber_total_currency.pdf`.
- A cancelled or corrected invoice is not deleted. Its status is updated and the audit trail remains available.
- The first pilot is restricted to one explicitly selected issued invoice. Historical backfill is a separate controlled run.

## Credential and cost policy

- Prefer native Billdu API/webhook access from n8n.
- Store the credential only in n8n credential storage; never in Git, workflow exports, Convex rows or chat.
- Do not route Billdu through Composio unless Billdu has no direct supported API and the fallback is explicitly approved.
- Poll at most twice daily unless webhooks are available. Use `updated since` and local idempotency to avoid unnecessary requests.

## Cutover gates

- authentication verified with one read-only request,
- one invoice detail and PDF retrieved,
- delivery date and totals validated,
- one Drive PDF and one register row created,
- second run produces zero duplicates,
- update/cancel behavior tested,
- only then enable webhook or twice-daily polling.
