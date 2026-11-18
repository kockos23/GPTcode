import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const workflow = JSON.parse(fs.readFileSync(new URL('../workflows/nora-personal-ops-planner.pilot.json', import.meta.url), 'utf8'))
const nodes = new Map(workflow.nodes.map(node => [node.name, node]))

test('personal operations planner export is inert and sanitized', () => {
  assert.equal(workflow.active, false)
  assert.equal(workflow.nodes.some(node => Object.hasOwn(node, 'credentials')), false)
  assert.equal(nodes.get('Convex — navrhni plán').disabled, true)
  assert.match(nodes.get('Convex — navrhni plán').parameters.url, /^REPLACE_WITH_CONVEX_SITE_URL/)
  assert.equal(workflow.settings.timezone, 'Europe/Bratislava')
  assert.equal(workflow.settings.saveDataSuccessExecution, 'none')
})

test('planner has daily and weekly schedules with stable idempotency keys', () => {
  assert.equal(nodes.get('Ranný plán — 06:30').parameters.rule.interval[0].expression, '30 6 * * *')
  assert.equal(nodes.get('Týždenný plán — nedeľa 18:00').parameters.rule.interval[0].expression, '0 18 * * 0')
  assert.match(nodes.get('Priprav denný plán').parameters.jsCode, /runId: 'daily:' \+ day/)
  assert.match(nodes.get('Priprav týždenný plán').parameters.jsCode, /runId: 'weekly:' \+ day/)
})

test('planner calls only the authenticated proposal endpoint', () => {
  const request = nodes.get('Convex — navrhni plán')
  assert.equal(request.parameters.authentication, 'genericCredentialType')
  assert.equal(request.parameters.genericAuthType, 'httpHeaderAuth')
  assert.match(request.parameters.url, /\/integrations\/n8n\/personal-ops\/planner$/)
  assert.equal(request.parameters.jsonBody, '={{ JSON.stringify($json) }}')
})
