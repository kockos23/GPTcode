import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const workflow = JSON.parse(fs.readFileSync(new URL('../workflows/nora-health-garmin-daily.pilot.json', import.meta.url), 'utf8'))
const nodes = new Map(workflow.nodes.map(node => [node.name, node]))

test('Garmin intake is inert, authenticated and sanitized', () => {
  assert.equal(workflow.active, false)
  assert.equal(workflow.nodes.some(node => Object.hasOwn(node, 'credentials')), false)
  assert.equal(nodes.get('Garmin bridge — denný súhrn').parameters.authentication, 'headerAuth')
  assert.equal(nodes.get('Convex — ulož Garmin deň').disabled, true)
  assert.match(nodes.get('Convex — ulož Garmin deň').parameters.url, /^REPLACE_WITH_CONVEX_SITE_URL/)
  assert.equal(workflow.settings.saveDataSuccessExecution, 'none')
})

test('Garmin normalization is bounded and does not trust arbitrary source fields', () => {
  const code = nodes.get('Normalizuj Garmin a CIRQA dáta').parameters.jsCode
  assert.match(code, /source:'GARMIN_CONNECT'/)
  assert.match(code, /steps,0,200000/)
  assert.match(code, /sleepMinutes,0,1440/)
  assert.match(code, /restingHeartRate,20,250/)
  assert.match(code, /averageStress,0,100/)
  assert.doesNotMatch(code, /\.\.\.body|\.\.\.source/)
})
