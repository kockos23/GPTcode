import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const seed = JSON.parse(fs.readFileSync(new URL('../../config/personal-ops.seed.example.json', import.meta.url), 'utf8'))
const script = fs.readFileSync(new URL('../../scripts/seed-personal-ops.mjs', import.meta.url), 'utf8')

test('seed describes known Garmin and utility assets without credentials', () => {
  const serialized = JSON.stringify(seed)
  assert.match(serialized, /Garmin Fenix 3/)
  assert.match(serialized, /Garmin CIRQA/)
  assert.match(serialized, /ZSE/)
  assert.match(serialized, /IMAZ s\.r\.o\./)
  assert.doesNotMatch(serialized, /password|bearer|api[_-]?key/i)
})

test('seed script is dry-run by default and requires HTTPS plus explicit apply', () => {
  assert.match(script, /mode !== '--apply'/)
  assert.match(script, /\^https:/)
  assert.match(script, /PERSONAL_OPS_INTEGRATION_SECRET/)
  assert.match(script, /REPLACE_WITH_/)
  assert.match(script, /ready: !hasPlaceholders/)
})
