# Agent collaboration protocol

## Purpose

ChatGPT/Codex, Claude Code, Cursor and Grok Bot exchange durable work through the Agent Handoff Bus. Chat transcripts are not a source of truth. GitHub owns code and reviewed documentation; Convex owns handoff state and audit; n8n connects bots and scheduled workers; NORA coordinates cross-domain work.

## Agent IDs

- `NORA` — central coordinator and owner-facing Chief of Staff.
- `CODEX` — repository implementation and operational verification.
- `CLAUDE_CODE` — repository analysis and implementation.
- `CURSOR` — interactive repository implementation with Cursor's default model.
- `CURSOR_GROK` — Grok selected inside Cursor; it uses the same repository and handoff adapter, but keeps its own agent identity.
- `GROK_BOT` — reserved for a future standalone xAI API worker connected through n8n. Cursor model access alone does not activate this identity.
- `SARA_FINANCE` and `VERA_IDEA_VAULT` — isolated specialist assistants; address them only for their domains.
- `ALL` — broadcast only for high-value state changes, never routine chatter.

## Handoff contract

Every handoff contains:

- `handoffId`: globally unique, stable across retries;
- `threadId`: shared workstream identifier;
- `fromAgent` and `toAgents`;
- `kind`: `TASK`, `RESULT`, `DECISION`, `BLOCKER`, or `CONTEXT_UPDATE`;
- `title` and short `summary`;
- bounded `context` containing only what the receiver needs;
- explicit `requestedAction`;
- `priority`: `P0`, `P1`, or `P2`;
- HTTPS `artifactUrls` for commits, PRs, documents, or dashboards;
- `correlationId` linking retries and external executions.

Statuses are `NEW → CLAIMED → DONE` or `BLOCKED`. Claims have a 15-minute lease. A crashed worker can be replaced after lease expiry. Completion from a stale or different claimant is rejected. Reusing a `handoffId` is idempotent.

## Working rules

1. Read `AGENTS.md` and this document before participating.
2. Claim before working. Never let two agents silently implement the same task.
3. Preserve user changes and identify the exact branch/commit before edits.
4. Put code in Git, binaries in their system of record, and only URLs plus concise context in the bus.
5. Never include credentials, tokens, private keys, raw customer documents, or full chat histories.
6. A result must say what changed, validations run, live mutations performed, remaining blocker, and next recommended agent.
7. Decisions requiring the owner go to `NORA`; specialist bots do not broaden their own authority.
8. SARA Finance, VERA and NORA keep separate credentials, monitors, prompts, and allowlists.

## HTTP API

All endpoints require `Authorization: Bearer <AGENT_HANDOFF_SECRET>` and fail closed when the secret is unset.

- `POST /integrations/agents/handoffs` — idempotently submit.
- `GET /integrations/agents/handoffs?agent=CODEX&limit=25` — inspect without claiming.
- `POST /integrations/agents/handoffs/claim` — atomically claim matching work.
- `POST /integrations/agents/handoffs/complete` — finish or block a valid claim.

Configure the URL and secret separately in each authorized environment as `AGENT_HANDOFF_URL` and `AGENT_HANDOFF_SECRET`. Do not commit either value. Grok used inside Cursor identifies as `CURSOR_GROK` and uses Cursor's environment. A future standalone Grok Bot must access these endpoints only through a narrow n8n workflow; it never receives Convex deploy credentials.

## Cursor with Grok

Selecting Grok as the model in Cursor does not create an external xAI bot and does not provide xAI API credentials. Start Cursor in this repository, let `.cursor/rules/project.mdc` load, set `AGENT_ID=CURSOR_GROK` in that environment, and use the same handoff CLI as other coding agents. Its code changes still go through the `work` branch and the normal validation rules.

Only build the n8n `GROK_BOT` adapter after a separate xAI API account/key is available and its cost, data retention and model policy have been approved.

## Deployment gate

The schema and endpoints may be deployed only after a new dedicated `AGENT_HANDOFF_SECRET` is stored in Convex and in the authorized agent/n8n credential stores. Do not reuse the broad n8n API key, Convex deploy key, SARA Telegram token, VERA token, or finance integration secret.
