# Chief of Staff command lifecycle

Dashboard acknowledgement is not execution. Every command uses the persisted lifecycle:

`NEW → PLANNED → RUNNING → WAITING_APPROVAL → NEW → PLANNED → RUNNING → DONE`

Failures end in `FAILED`; the owner may retry up to three attempts. The owner may cancel every non-terminal command. Safe commands may go directly from `RUNNING` to `DONE`.

## Guarantees

- A worker claims a bounded batch and receives a 15-minute lease and monotonically increasing attempt.
- Start and completion callbacks must match command ID, worker and attempt. Stale callbacks are rejected.
- Calendar and Drive mutations stop at `WAITING_APPROVAL` until the owner approves them.
- Creating an internal Chief of Staff task executes synchronously and records `DONE` with the created task ID.
- Preparing a Gmail draft does not send it. Sending remains a separate owner-approved action.
- The UI reads Convex state and audit events; it never infers completion from a button click.

## n8n API

All routes require the existing NORA n8n bearer credential:

- `POST /integrations/n8n/chief-of-staff/commands/claim`
- `POST /integrations/n8n/chief-of-staff/commands/start`
- `POST /integrations/n8n/chief-of-staff/commands/complete`

The worker must call `start` before performing an adapter action and `complete` after it. An unsupported source or missing attachment is a bounded `FAILED` result, never a synthetic success.
