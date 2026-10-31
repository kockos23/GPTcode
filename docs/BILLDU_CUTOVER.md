# Billdu → SARA integration contract

## Goal

Issued invoices from Billdu must arrive in the existing WOF finance system without a second dashboard or Composio. n8n is the integration layer, Drive stores the PDF original, Sheets keeps the operational register and Convex/Macaly provides status and review.

Billdu authenticates requests with `apiKey`, Unix timestamp and an HMAC-SHA512 signature generated with `apiSecret`. Both secrets live only in the Convex environment. n8n calls authenticated Convex proxy endpoints and never receives either Billdu secret. The official client exposes `/documents` and `/documents/{id}/download`; it does not expose a webhook API, so the target design uses bounded twice-daily polling without OpenAI extraction.

Before enabling writes, run the inactive manual workflow `SARA v2 — Billdu Read-only Probe`. It reads at most ten records and reports only field names/types. It performs no Drive or Sheets write. Use the observed schema to lock the issued-invoice status and delivery-date mapping; never fall back to email receipt time or import time.

## Verified Billdu capability

The official client confirms API authentication, document listing and PDF download. No webhook API is exposed by that client, therefore production uses bounded polling twice daily. The first live call remains a read-only plan/access check and must not write accounting data.

If the current Billdu plan rejects API access, stop the pilot and use scheduled export to the dedicated finance mailbox only after explicit approval. Do not introduce Composio as an unreviewed fallback.

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

Before any Drive or register write, n8n must atomically claim the normalized document through `POST /integrations/n8n/billdu/imports/claim`. The claim uses `sourceDocumentId` plus a stable `sourceVersion`, has a 30-minute lease and returns `ALREADY_IMPORTED` for the same completed version or `BUSY` for a concurrent run. After both Drive and register evidence exist, n8n calls `POST /integrations/n8n/billdu/imports/complete`. A success without Drive file ID, Drive URL and register document ID is rejected. Failed or expired attempts can be retried; a newer Billdu version reuses the same record without duplicating the invoice.

## Idempotency and routing

- `documentId = billdu:<sourceInvoiceId>` is the stable key. Updating an invoice must update the same record, never append a second accounting document.
- Drive destination is `YYYY-MM/Vystavene_FA`, derived from the explicit delivery/date-of-supply date—not creation, email or synchronization time.
- PDF filename follows the existing safe convention: `deliveryDate_customer_invoiceNumber_total_currency.pdf`.
- A cancelled or corrected invoice is not deleted. Its status is updated and the audit trail remains available.
- The first pilot is restricted to one explicitly selected issued invoice. Historical backfill is a separate controlled run.

## Credential and cost policy

- Prefer native Billdu API access through the narrow Convex proxy called by n8n.
- Store `BILLDU_API_KEY` and `BILLDU_API_SECRET` only in Macaly/Convex secrets; never in n8n, Git, workflow exports, Convex rows or chat.
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

Billdu import leases and failures are part of the central finance health snapshot. A processing lease older than 30 minutes or any failed import makes health unhealthy and routes through SARA error monitoring after activation.
