import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const workflow=JSON.parse(fs.readFileSync(new URL('../workflows/health-performance-weekly.pilot.json',import.meta.url),'utf8'))

test('weekly health review is inactive, bounded, authenticated and non-diagnostic',()=>{
  assert.equal(workflow.active,false)
  const request=workflow.nodes.find(node=>node.id==='health-history-request')
  const telegram=workflow.nodes.find(node=>node.id==='health-weekly-telegram')
  const summary=workflow.nodes.find(node=>node.id==='health-weekly-summary')
  assert.match(request.parameters.url,/health\/history\?days=30$/)
  assert.equal(request.parameters.authentication,'genericCredentialType')
  assert.equal(request.disabled,true)
  assert.equal(telegram.disabled,true)
  assert.match(summary.parameters.jsCode,/nie diagnózu ani dôkaz príčiny/)
  assert.doesNotMatch(JSON.stringify(workflow),/Bearer\s+[A-Za-z0-9_-]{16,}/)
})
