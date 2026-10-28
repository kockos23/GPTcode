import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const workflow = JSON.parse(
  fs.readFileSync(new URL('../workflows/sara-v2-direct-google.pilot.json', import.meta.url), 'utf8'),
)
const nodes = new Map(workflow.nodes.map((node) => [node.name, node]))
const serialized = JSON.stringify(workflow)

test('export contains no tenant credential bindings or Composio calls', () => {
  assert.equal(workflow.nodes.some((node) => Object.hasOwn(node, 'credentials')), false)
  assert.equal(/composio/i.test(serialized), false)
})

test('Gmail intake is restricted and scheduled for 06:15 on workdays', () => {
  const trigger = nodes.get('Gmail — WOF finance intake')
  assert.ok(trigger)
  assert.match(trigger.parameters.filters.q, /label:WOF_FINANCE_INTAKE/)
  assert.match(trigger.parameters.filters.q, /has:attachment/)
  assert.equal(trigger.parameters.pollTimes.item[0].cronExpression, '0 15 6 * * 1-5')
})

test('routing uses delivery or explicit report-period date and never 00_INBOX', () => {
  const parser = nodes.get('Validuj a zaraď podľa dodania')
  assert.ok(parser)
  assert.match(parser.parameters.jsCode, /deliveryDate/)
  assert.match(parser.parameters.jsCode, /periodEndDate/)
  assert.match(parser.parameters.jsCode, /targetFolderId/)
  assert.equal(/00_INBOX/.test(serialized), false)
})

test('OpenAI extraction is schema constrained and preserves output budget', () => {
  const prepare = nodes.get('Priprav extrakciu dokladu v2')
  assert.ok(prepare)
  assert.match(prepare.parameters.jsCode, /type:'json_schema'/)
  assert.match(prepare.parameters.jsCode, /strict:true/)
  assert.match(prepare.parameters.jsCode, /confidence:\{type:'integer',minimum:0,maximum:100\}/)
  assert.match(prepare.parameters.jsCode, /max_output_tokens:4096/)
  assert.match(prepare.parameters.jsCode, /reasoning:\{effort:'low'\}/)
})

test('unsafe documents branch to review while safe documents upload monthly', () => {
  const branch = workflow.connections['Je bezpečné automaticky zaradiť?']?.main
  assert.equal(branch?.[0]?.[0]?.node, 'Nahraj do mesačného priečinka')
  assert.equal(branch?.[1]?.[0]?.node, 'Zapíš doklad do review registra')
  assert.ok(nodes.has('Zapíš zaradený doklad do registra'))
})

