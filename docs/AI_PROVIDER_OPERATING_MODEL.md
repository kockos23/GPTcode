# AI provider operating model

## Goal

Chief of Staff uses one durable Agent Handoff Bus instead of copying whole chats between products. NORA owns planning and owner-facing decisions; specialist tools claim bounded tasks, return results and link durable artifacts. A paid consumer subscription is useful for interactive work, but does not automatically include API access.

## Recommended roles

| Tool | Primary role | Connection mode | Current readiness |
| --- | --- | --- | --- |
| Codex | repository implementation, tests, operational checks | Git + handoff HTTP adapter | protocol and CLI ready |
| Claude Code | independent code review, large refactors, repository analysis | Git + handoff HTTP adapter | protocol ready; local credential setup remains |
| Cursor | interactive edits and visual repository work | Git + handoff CLI | project rule and protocol ready |
| Grok in Cursor | alternative coding/review model | same Cursor adapter as `CURSOR_GROK` | protocol ready |
| standalone Grok Bot | research/review tasks without repository credentials | restricted remote MCP endpoint | MCP endpoint ready; connector setup remains |
| ChatGPT | interactive strategy, writing and general analysis | manual handoff initially; API only with a separate OpenAI API account | planned |
| Claude web/app | interactive long-form analysis and critique | manual handoff initially; API only with a separate Anthropic API account | planned |
| Perplexity | cited web research and source discovery | manual handoff initially; API only with a separate Perplexity API account | planned |

`Ready` means the software path exists. It does not mean an external product has authenticated successfully. Agent Control must show real connectivity separately from the list of agents that can receive a queued handoff.

## Routing policy

- Code changes: Codex by default; Claude Code for an independent review or a second implementation proposal; Cursor for owner-driven visual editing.
- Current web research with citations: Perplexity; Grok can provide a second view for social or real-time discourse.
- Strategy and synthesis: NORA coordinates; ChatGPT or Claude may produce a bounded draft, but NORA merges it with the system state.
- Financial, health or private household data: only the relevant isolated specialist and approved data source. Do not broadcast it to general agents.
- External writes, purchases, messages, calendar mutations and destructive operations: proposal first and explicit owner approval unless an existing narrowly scoped rule already authorizes the action.
- Never ask several paid models the same open-ended question by default. Use a second model for verification only when risk, ambiguity or value justifies the cost.

## Standard task lifecycle

1. NORA creates one handoff with a specific deliverable and minimal context.
2. The selected agent claims it; the 15-minute lease prevents silent duplicate work.
3. The agent works in its own authorized environment and stores code or documents in their normal system of record.
4. It completes the handoff with a concise result, validation evidence, artifact links and any blocker.
5. NORA updates the owner-facing plan and sends a follow-up only when needed.

## Connection order

1. Generate one new dedicated `AGENT_HANDOFF_SECRET`; never reuse n8n, Convex deploy, finance or bot tokens.
2. Store it in the Live Convex deployment and each explicitly authorized agent environment.
3. Set `AGENT_HANDOFF_URL` to `https://coordinated-mongoose-77.eu-west-1.convex.site/integrations/agents/handoffs` for CLI workers.
4. Verify each identity with a harmless round trip: submit, list, claim and complete.
5. Connect the standalone Grok Bot to the restricted MCP URL documented in `AGENT_COLLABORATION.md`.
6. Add provider APIs later only where automation creates enough value to justify separate API billing.

## Owner inputs that remain unavoidable

- creation/storage of the dedicated handoff secret;
- login or API key for each external provider that should run unattended;
- one-time approval of each external MCP/custom connector;
- confirmation of spending limits before enabling paid provider APIs.

Everything else—schema, queue, ownership checks, audit trail, UI, adapter contract and verification commands—can be prepared in the repository first.
