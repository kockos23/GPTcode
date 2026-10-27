# SARA WOF Finance — pilot and operations runbook

## Safety before deployment

1. Keep `WOF_FINANCE_EMAIL_CRON_ENABLED` unset or set to `false` during the pilot.
2. Create the Gmail label `WOF_FINANCE_INTAKE` and apply it only to messages intended for SARA. A Gmail filter can apply the label automatically to the dedicated intake address or subject convention.
3. If a different Gmail search is required, set `WOF_FINANCE_GMAIL_QUERY` explicitly. Keep spam and trash excluded.
4. Back up the `Doklady` sheet before the first live payment confirmation.
5. Deploy the Convex schema and functions from Macaly before testing the updated dashboard.

## Document intake pilot

Use test copies, not the only copy of an accounting document.

1. Send a text-based PDF invoice in October whose `Dátum dodania` is in September. Apply the intake label.
2. Run **Skontrolovať teraz**.
3. Confirm that the file is stored in `2026/09/2026/Doklady`, not in October and not in `00_INBOX`.
4. Send the same message through the check again and confirm that no duplicate Drive file appears.
5. Send a scanned/image-only invoice. Confirm that it appears in **Dokumenty čakajúce na zaradenie** and is not filed automatically.
6. Review that document, enter its actual delivery date and category, confirm it, and verify the final Drive location.
7. Repeat with a Czech `DUZP`, an English `Date of supply`, a bank statement period, and a Stripe report period.

## Bank statement and matching pilot

1. Put matching CSV and PDF statement files in the correct monthly `Vypisy` folder.
2. Import the CSV and verify statement totals, account suffix, period, and transaction count against the PDF.
3. Run **Navrhnúť párovanie**.
4. Confirm that only outgoing transactions with an unambiguous amount/reference/supplier match receive a proposal.
5. Reject one proposal and confirm the Google Sheet remains unchanged.
6. Back up the sheet again, then confirm one valid proposal.
7. Verify the payment status, transaction reference, paid amount, and audit history in the `Doklady` sheet.
8. Re-import the same CSV and confirm that duplicate transactions are not created.

## Enabling scheduled operation

Enable `WOF_FINANCE_EMAIL_CRON_ENABLED=true` only after the pilot passes. Scheduled checks run on workdays at 06:15 Europe/Bratislava. Keep the review queue monitored; a non-empty queue is expected for scans or unfamiliar invoice layouts and is safer than filing documents into the wrong month.

## Current deliberate limitations

- Text-based PDF, CSV, XML, and text attachments can be read automatically.
- Scanned PDFs and images require manual review until a privacy-approved OCR provider is configured.
- Matching never marks a payable paid automatically; confirmation is required.
- The source email is never altered or deleted.

