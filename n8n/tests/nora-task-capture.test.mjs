import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('../../scripts/upgrade-nora-task-capture.mjs', import.meta.url), 'utf8')

test('NORA preserves multiple dictated tasks and bounds fan-out', () => {
  assert.match(source, /every distinct task/)
  assert.match(source, /slice\(0,25\)/)
  assert.match(source, /taskId:/)
  assert.match(source, /taskDeadline/)
})

test('NORA writes idempotent tasks to Convex through authenticated n8n boundary', () => {
  assert.match(source, /chief-of-staff\/tasks/)
  assert.match(source, /httpHeaderAuth/)
  assert.match(source, /genericCredentialType/)
  assert.match(source, /Convex — ulož NORA úlohu/)
})

test('calendar remains only a suggestion on captured tasks', () => {
  assert.match(source, /suggestedAction/)
  assert.match(source, /Calendar creation remains separately owner-approved/)
})
