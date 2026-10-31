# SARA WOF Finance — pilot and operations runbook

## Safety before deployment

1. Keep `WOF_FINANCE_EMAIL_CRON_ENABLED` unset or set to `false` during the pilot.
2. Create the Gmail label `WOF_FINANCE_INTAKE` and apply it only to messages intended for SARA. A Gmail filter can apply the label automatically to the dedicated intake address or subject convention.
3. If a different Gmail search is required, set `WOF_FINANCE_GMAIL_QUERY` explicitly. Keep spam and trash excluded.
4. Back up the `Doklady` sheet before the first live payment confirmation.
5. Deploy the Convex schema and functions from Macaly before testing the updated dashboard.
6. Keep both n8n SARA workflows inactive until the controlled pilot. The legacy workflow must remain inactive permanently; activate only SARA v2 after the pilot gates pass.

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

## Production cutover

The legacy Convex/Composio email cron has been removed. `WOF_FINANCE_EMAIL_CRON_ENABLED` remains false only for backward-compatible environment configuration. Scheduled intake belongs to the direct-Google n8n workflows defined in `docs/ARCHITECTURE.md`; activate new cutover workflows only after their gates and pilot pass. Keep the review queue monitored: a non-empty queue is expected for scans or unfamiliar invoice layouts and is safer than filing documents into the wrong month.

The n8n pilot workflow ID is `ajAP0czttC0c9syg`. Its legacy predecessor `d6twgMlkoiJSa4o0` must remain inactive because it scans all Gmail attachments and targets `00_INBOX`.

After the Convex cutover, activate Finance Health Monitor `2YGEEBjYBn8aNBsY` only after register sync, command processing, review resolution and bank import pilots pass. It runs at 07:35 and 17:35 Europe/Bratislava and intentionally fails on stale operational state so the existing SARA error workflow sends a Telegram alert. A review-required queue is informational and does not by itself fail health; failed reviews do.

The twice-daily production sequence is intentionally ordered: Drive intake at `:15`, finance commands at `:18`, review resolutions at `:22`, register sync at `:27`, bank import at `:30`, and health at `:35`. Register sync must remain after every workflow that can update the `Doklady` sheet, otherwise the dashboard cache can lag by twelve hours.

Live configuration audit 31 October 2026 confirmed that Gmail, Drive and Telegram intake explicitly reference the central SARA error workflow `cmGxWnoZh613XRWTF7o09`. All three remained active and no active SARA/NORA workflow had a new error in the preceding seven days.

The three active SARA intake workflows retain error payloads for diagnostics but do not retain successful execution payloads or progress snapshots. Each has a 15-minute execution timeout. Accounting evidence remains in the Drive archive and WOF register; n8n execution metadata remains available without duplicating successful invoice contents.

Run `npm run finance:audit` for a read-only live n8n audit that does not require Convex. It verifies expected active/inactive workflow states, placeholders, SARA error routing, Europe/Bratislava schedules, safe execution retention and the absence of new active-workflow errors during the previous seven days. It requests execution metadata only, never execution payloads.

Bank imports are resumable. If an action stops after creating the statement but before all transaction batches finish, rerunning the same source file fills only missing operations and derives the final count from stored rows. Finance health reports `BANK_IMPORT_STUCK` when such a processing record is older than 30 minutes.

## Current deliberate limitations

- Text-based PDF, CSV, XML, and text attachments can be read automatically.
- Scanned PDFs and images require manual review until a privacy-approved OCR provider is configured.
- Matching never marks a payable paid automatically; confirmation is required.
- The source email is never altered or deleted.

