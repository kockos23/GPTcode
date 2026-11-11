import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('../../scripts/provision-billdu-workflow.mjs', import.meta.url), 'utf8')
const nodeMatch = source.match(/name: "Pokračuj iba s novým importom"[\s\S]*?parameters: \{ mode: "runOnceForAllItems", jsCode: `([^`]*)` \}/)
const jsCode = nodeMatch?.[1]

function select(items) {
  const $input = { all: () => items }
  return new Function('$input', jsCode)($input)
}

test('the claim gate runs once for the whole batch', () => {
  assert.ok(jsCode)
  assert.match(source, /Pokračuj iba s novým importom[\s\S]*mode: "runOnceForAllItems"/)
  assert.doesNotMatch(jsCode, /return \$input\.all\(\)/)
})

test('an already imported invoice does not hide a later new invoice', () => {
  const items = [
    { json: { ok: true, status: 'ALREADY_IMPORTED', attempts: 1, sourceDocumentId: 'old' } },
    { json: { ok: true, status: 'CLAIMED', attempts: 1, sourceDocumentId: 'new' } },
  ]
  const selected = select(items)
  assert.deepEqual(selected.map(item => item.json.sourceDocumentId), ['new'])
  assert.deepEqual(selected[0].pairedItem, { item: 1 })
})

test('a new invoice does not pull completed or busy invoices through to Drive', () => {
  const items = [
    { json: { ok: true, status: 'CLAIMED', attempts: 1, sourceDocumentId: 'new' }, binary: { data: true } },
    { json: { ok: true, status: 'ALREADY_IMPORTED', attempts: 1, sourceDocumentId: 'done' } },
    { json: { ok: true, status: 'BUSY', attempts: 2, sourceDocumentId: 'leased' } },
  ]
  const selected = select(items)
  assert.deepEqual(selected.map(item => item.json.sourceDocumentId), ['new'])
  assert.deepEqual(selected[0].pairedItem, { item: 0 })
  assert.equal(selected[0].binary.data, true)
})

test('every newly claimed invoice in the page is kept', () => {
  const items = [
    { json: { ok: true, status: 'CLAIMED', attempts: 1, sourceDocumentId: 'a' } },
    { json: { ok: true, status: 'CLAIMED', attempts: 1, sourceDocumentId: 'b' } },
  ]
  assert.deepEqual(select(items).map(item => item.pairedItem.item), [0, 1])
})

test('a claim response without ok fails before any upload', () => {
  assert.throws(
    () => select([
      { json: { ok: true, status: 'CLAIMED', sourceDocumentId: 'a' } },
      { json: { ok: false, status: 'CLAIMED', sourceDocumentId: 'b' } },
    ]),
    /Billdu claim zlyhal/,
  )
})
