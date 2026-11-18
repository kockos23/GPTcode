import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('../../scripts/build-nora-calendar-workflow.mjs', import.meta.url), 'utf8')

test('NORA calendar writes are owner-approved and primary-only', () => {
  assert.match(source, /ownerChat/)
  assert.match(source, /calendarPending/)
  assert.match(source, /CONFIRM/)
  assert.match(source, /Odpovedz ÁNO alebo ZRUŠ/)
  assert.doesNotMatch(source, /calendars\/\{\{/)
  assert.equal((source.match(/calendars\/primary/g) || []).length, 3)
})

test('calendar payloads are prepared before HTTP execution', () => {
  assert.match(source, /Prepare Calendar Create Body/)
  assert.match(source, /Prepare Calendar Find Request/)
  assert.match(source, /Prepare Calendar Move Body/)
  assert.equal((source.match(/body: '=\{\{ \$json\.requestBody \}\}'/g) || []).length, 2)
})

test('relative dates receive a live Bratislava clock and moves preserve duration', () => {
  assert.match(source, /CURRENT_DATETIME_EUROPE_BRATISLAVA/)
  assert.match(source, /setZone\("Europe\/Bratislava"\)/)
  assert.match(source, /oldEnd-oldStart/)
  assert.match(source, /rows\.length!==1/)
})

test('one approval can create multiple rich events', () => {
  assert.match(source, /calendarEvents/)
  assert.match(source, /events\.map\(event/)
  assert.match(source, /description:event\.description/)
  assert.match(source, /location:event\.location/)
  assert.match(source, /slice\(0,8000\)/)
})
