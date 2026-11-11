const base = process.env.AGENT_HANDOFF_URL?.replace(/\/$/, "")
const secret = process.env.AGENT_HANDOFF_SECRET
if (!base || !secret) throw new Error("AGENT_HANDOFF_URL and AGENT_HANDOFF_SECRET are required")

const [command, json = "{}"] = process.argv.slice(2)
const input = JSON.parse(json)
const routes = {
  send: ["/integrations/agents/handoffs", "POST"],
  list: ["/integrations/agents/handoffs", "GET"],
  claim: ["/integrations/agents/handoffs/claim", "POST"],
  complete: ["/integrations/agents/handoffs/complete", "POST"],
}
if (!Object.hasOwn(routes, command)) throw new Error("Use: send | list | claim | complete")
const [path, method] = routes[command]
const query = method === "GET" ? "?" + new URLSearchParams(input).toString() : ""
const response = await fetch(base + path + query, {
  method,
  headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
  body: method === "GET" ? undefined : JSON.stringify(input),
})
const text = await response.text()
if (!response.ok) throw new Error(`${response.status}: ${text.slice(0, 1000)}`)
console.log(JSON.stringify(JSON.parse(text), null, 2))
