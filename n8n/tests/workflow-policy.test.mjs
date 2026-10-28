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
  assert.equal(/spreadsheets\/1[A-Za-z0-9_-]{20,}\//.test(serialized), false)
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
  assert.equal(/:'1[A-Za-z0-9_-]{20,}'/.test(parser.parameters.jsCode), false)
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

test('persistent register dedupe runs before OpenAI extraction', () => {
  const lookup = nodes.get('Načítaj existujúce Doklad ID')
  const check = nodes.get('Skontroluj trvalú deduplikáciu')
  const branch = nodes.get('Doklad ešte nie je v registri?')
  assert.ok(lookup)
  assert.ok(check)
  assert.ok(branch)
  assert.match(lookup.parameters.url, /sheets\.googleapis\.com/)
  assert.match(lookup.parameters.url, /Doklady%21A%3AA/)
  assert.match(lookup.parameters.url, /REPLACE_WITH_WOF_FINANCE_SHEET_ID/)
  assert.equal(
    workflow.connections['Doklad ešte nie je v registri?'].main[0][0].node,
    'Priprav extrakciu dokladu v2',
  )
})

