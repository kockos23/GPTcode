# Macaly handoff

This package is an updated copy of the Macaly export. Keep Macaly as the primary project and merge/import the files from the package without replacing the existing Macaly-managed secrets.

## Important deployment steps

1. Install the locked dependencies. The new production dependency is `unpdf`.
2. Deploy the updated Convex schema and functions.
3. Keep `WOF_FINANCE_EMAIL_CRON_ENABLED=false` during the pilot.
4. Create the Gmail label `WOF_FINANCE_INTAKE`, or configure an equivalent restricted `WOF_FINANCE_GMAIL_QUERY`.
5. Run the pilot in `docs/OPERATIONS.md` before enabling the cron.

## Implemented changes

- Invoice month is derived from delivery/tax-point data inside the document, never from email receipt time, subject, or file name.
- Text extraction for text-based PDF, CSV, XML, and text files.
- Safe manual-review queue for scans, images, unsupported formats, and ambiguous dates.
- Manual review UI with confirmed delivery date and destination category.
- Monthly routing to `Doklady`, `Stripe`, `Vypisy`, and `Vystavene_FA`.
- Removed stale `00_INBOX` wording and links to obsolete standalone folders.
- Manual payables now require a delivery date and use it for the accounting period.
- Bank duplicate detection is scoped by account and operation ID.
- Bank summary values correctly parse thousands separators.
- Conservative payment-match proposals with explicit user confirmation/rejection.
- Intake concurrency lock and a disabled-by-default production cron.
- Replaced placeholder tests with document-routing, statement-parsing, and payment-matching tests.
- Updated locked dependencies; production dependency audit reports zero known vulnerabilities.

## Deliberate safety rules

- No payment match changes the Google Sheet before explicit confirmation.
- No ambiguous document is filed using a guessed month.
- No source email is changed or deleted.
- Image/scanned-document OCR is not silently delegated to an unknown external service; those documents enter manual review until a privacy-approved OCR integration is selected.

