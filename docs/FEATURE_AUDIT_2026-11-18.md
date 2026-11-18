# Chief of Staff HQ — feature audit and next backlog

Audit date: 18 November 2026. This separates visible UI, persisted behavior, external execution, and production verification.

| Area | UI | Persists | External action | Current status |
| --- | --- | --- | --- | --- |
| Owner authentication | Yes | Auth tables | Google OAuth | Live |
| Daily live briefing | Yes | Convex snapshot | n8n reads Gmail, Calendar, Sheets | Live/pilot verified |
| Command Center | Yes | Convex command queue | Depends on assigned worker | Queue live; workers vary |
| Inbox Radar | Yes | Snapshot | Opens Gmail | Core live; category tabs visual only |
| Calendar day view | Yes | Snapshot | Opens Google Calendar | Live read |
| NORA calendar create/move | Telegram | n8n pending proposal | Google Calendar primary | Pilot verified |
| Multi-event calendar request | Telegram | n8n pending batch | Google Calendar primary | Pilot verified |
| Decision Queue | Yes | Mixed/static | No generic executor | Needs Convex migration |
| Project Register | Yes | Static code register | None | Needs live CRUD |
| Personal tasks | Yes | Convex + snapshot merge | None required | Live |
| AI Work Queue | Yes | Convex/snapshot | Worker-dependent | Live state; execution varies |
| NORA task intake | Dashboard + Telegram | Convex + task register | Optional calendar proposal | Live |
| VERA Idea Vault | Dashboard + Telegram | Convex | AI/Drive through n8n | Live/pilot |
| VERA → NORA task | Yes | Convex task | None required | Backend/frontend prepared |
| Health dashboard | Yes | Convex | None | Published after Macaly sync |
| Health check-in | Yes | Convex | None | Prepared/published |
| Habits | Yes | Convex | None | Prepared/published |
| Supplements | Yes after latest commit | Convex | None | Requires next Macaly sync |
| Garmin import | Health UI ready | Convex endpoint ready | VPS bridge → n8n → Convex | Blocked on VPS/MFA |
| Health associations | Logic/tests | Not yet scheduled | None | Foundation ready |
| Agent Control | Yes | Snapshot | n8n sync | Live |
| WOF Finance | Yes | Convex + Google registers | n8n workers | Mixed production/pilot; use finance runbook |
| Custom private domain | No configuration yet | N/A | DNS/Macaly | Deferred by owner |

## Highest-value next work

### P0 — Finish the health data path

1. Deploy latest frontend/backend commit through Macaly.
2. Install the Garmin sibling container on the private n8n VPS.
3. Perform Garmin interactive MFA bootstrap in the attached VPS terminal.
4. Create/attach a dedicated n8n Header Auth credential for the Garmin webhook.
5. Enable the Convex HTTP node, run a one-day pilot, verify the Health dashboard, then activate the daily schedule.

### P0 — Separate truth from presentation

Migrate projects, decisions and the three daily outcomes from code constants to Convex. Add audited create/update/status changes and retain a read-only fallback. This removes the largest remaining mismatch between a polished dashboard and an operational system.

### P1 — Health assistant interaction

- Telegram text/voice capture for check-in, habit and supplement logs.
- Weekly descriptive report with sample size, date range, missing-data warning and no causal wording.
- Freeletics completion adapter only after confirming an accessible export/API route.
- Strava remains secondary to Garmin unless it contributes unique activity fields.

### P1 — Calendar completeness

Read all calendars visible to the connected Google account, while continuing to write only to `primary`. Store calendar ID/name/color in the snapshot and add filters. Confirm shared calendars individually because Google ACL permissions differ.

### P1 — Unified action lifecycle

Every command should visibly progress through `NEW → PLANNED → RUNNING → WAITING_APPROVAL → DONE/FAILED`, with timestamp, agent, result and retry. A dashboard acknowledgement must not be confused with an executed external action.

### P2 — UX completion

- Make Inbox Radar tabs functional.
- Implement calendar Day/Week/Month and filters.
- Add project/decision live editing and history.
- Add Universal Inbox and Goals/RPM only after the live registers exist.
- Attach the final private custom domain after the application flow stabilizes.

## Morning input bundle required from owner

Do not send credentials in chat. The next unavoidable inputs are:

1. Identify the n8n VPS provider/control panel and provide a secure attached terminal or approved SSH path; no password in chat.
2. Enter Garmin Connect email/password/MFA directly in that terminal during bootstrap.
3. Confirm the preferred public name and portrait for the Health & Performance assistant. The working label can remain until then.
4. After the latest Git sync, click Macaly Publish once for the supplement UI and Garmin hardening documentation changes.

Everything else can continue without owner input.
