import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const workflow = JSON.parse(
  fs.readFileSync(new URL('../workflows/sara-v2-direct-google.pilot.json', import.meta.url), 'utf8'),
)
const nodes = new Map(workflow.nodes.map((node) => [node.name, node]))
const serialized = JSON.stringify(workflow)
const bankCsvWorkflow = JSON.parse(
  fs.readFileSync(new URL('../workflows/sara-v2-bank-csv-direct.pilot.json', import.meta.url), 'utf8'),
)
const bankCsvNodes = new Map(bankCsvWorkflow.nodes.map((node) => [node.name, node]))
const bankCsvSerialized = JSON.stringify(bankCsvWorkflow)
const noraMonitorWorkflow = JSON.parse(
  fs.readFileSync(new URL('../workflows/nora-error-monitoring.pilot.json', import.meta.url), 'utf8'),
)
const noraMonitorSerialized = JSON.stringify(noraMonitorWorkflow)
const reviewWorkflow = JSON.parse(
  fs.readFileSync(new URL('../workflows/sara-v2-review-resolution.pilot.json', import.meta.url), 'utf8'),
)
const reviewNodes = new Map(reviewWorkflow.nodes.map((node) => [node.name, node]))
const reviewSerialized = JSON.stringify(reviewWorkflow)

test('export contains no tenant credential bindings or Composio calls', () => {
  assert.equal(workflow.nodes.some((node) => Object.hasOwn(node, 'credentials')), false)
  assert.equal(/composio/i.test(serialized), false)
  assert.equal(/spreadsheets\/1[A-Za-z0-9_-]{20,}\//.test(serialized), false)
})

test('Gmail intake is restricted and scheduled for 06:15 on workdays', () => {
  const trigger = nodes.get('Gmail — WOF finance intake')
  assert.ok(trigger)
  assert.match(trigger.parameters.filters.q, /label:WOF_FINANCE_INTAKE/)
  assert.match(trigger.parameters.filters.q, /to:finance@wofevents\.com/)
  assert.match(trigger.parameters.filters.q, /has:attachment/)
  assert.equal(trigger.parameters.pollTimes.item[0].cronExpression, '0 15 6 * * 1-5')
})

test('Gmail source attachment identity avoids transient n8n file IDs', () => {
  const split = nodes.get('Rozdeľ podporované prílohy')
  assert.ok(split)
  assert.match(split.parameters.jsCode, /attachmentId = String\(key\)/)
  assert.doesNotMatch(split.parameters.jsCode, /file\.id|file\.attachmentId/)
  assert.match(split.parameters.jsCode, /'gmail:' \+ messageId \+ ':' \+ attachmentId/)
})

test('content SHA-256 becomes the persistent document identity before dedupe', () => {
  const hash = nodes.get('SHA-256 obsahu prílohy')
  const merge = nodes.get('Spoj hash a prílohu')
  const identity = nodes.get('Nastav identitu podľa SHA-256')
  const validate = nodes.get('Validuj a zaraď podľa dodania')
  assert.ok(hash)
  assert.ok(merge)
  assert.ok(identity)
  assert.ok(validate)
  assert.equal(hash.type, 'n8n-nodes-base.crypto')
  assert.equal(hash.parameters.type, 'SHA256')
  assert.equal(hash.parameters.binaryData, true)
  assert.match(identity.parameters.jsCode, /documentKey = 'sha256:' \+ sha256/)
  assert.match(identity.parameters.jsCode, /documentId = 'WOF-' \+ documentKey/)
  assert.match(validate.parameters.jsCode, /sha256:clean\(meta\.sha256\)/)
  assert.equal(workflow.connections['Rozdeľ podporované prílohy'].main[0][0].node, hash.name)
  assert.equal(workflow.connections['Rozdeľ podporované prílohy'].main[0][1].node, merge.name)
  assert.equal(workflow.connections['Rozdeľ podporované prílohy'].main[0][1].index, 1)
  assert.equal(workflow.connections[hash.name].main[0][0].node, merge.name)
  assert.equal(workflow.connections[hash.name].main[0][0].index, 0)
  assert.equal(workflow.connections[merge.name].main[0][0].node, identity.name)
  assert.equal(workflow.connections[identity.name].main[0][0].node, 'Deduplikácia Gmail prílohy')
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

test('all twelve 2026 months have four sanitized Drive destinations', () => {
  const parser = nodes.get('Validuj a zaraď podľa dodania')
  const entries = [...parser.parameters.jsCode.matchAll(
    /'(2026-\d{2})': \{Doklady:'(REPLACE_[^']+)',Stripe:'(REPLACE_[^']+)',Vystavene_FA:'(REPLACE_[^']+)',Vypisy:'(REPLACE_[^']+)'\}/g,
  )]
  assert.deepEqual(
    entries.map((entry) => entry[1]),
    Array.from({ length: 12 }, (_, index) => `2026-${String(index + 1).padStart(2, '0')}`),
  )
  assert.equal(entries.flatMap((entry) => entry.slice(2)).length, 48)
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

test('routing preserves the actual intake channel and requires invoice currency', () => {
  const validate = nodes.get('Validuj a zaraď podľa dodania')
  assert.ok(validate)
  assert.match(validate.parameters.jsCode, /source:clean\(meta\.source\)\|\|'unknown'/)
  assert.doesNotMatch(validate.parameters.jsCode, /source:'gmail'/)
  assert.match(validate.parameters.jsCode, /Chýba alebo je neplatná mena/)
  assert.match(validate.parameters.jsCode, /destination==='Doklady'\|\|destination==='Vystavene_FA'/)
})

test('review rows retain a direct link to the original Drive file', () => {
  const review = nodes.get('Zapíš doklad do review registra')
  assert.ok(review)
  assert.match(review.parameters.columns.value['Originál Drive ID'], /sourceMessageId/)
  assert.match(review.parameters.columns.value['Originál \/ link'], /drive\.google\.com\/file\/d\//)
  assert.match(review.parameters.columns.value.Poznámka, /Zdroj ID:/)
  assert.doesNotMatch(review.parameters.columns.value.Poznámka, /Gmail message:/)
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

test('bank CSV export is direct, sanitized and inert before Convex cutover', () => {
  assert.equal(bankCsvWorkflow.nodes.some((node) => Object.hasOwn(node, 'credentials')), false)
  assert.equal(/composio|openai/i.test(bankCsvSerialized), false)
  assert.equal(/1[A-Za-z0-9_-]{20,}/.test(bankCsvSerialized), false)
  assert.equal((bankCsvSerialized.match(/REPLACE_WITH_2026_\d{2}_VYPISY_FOLDER_ID/g) ?? []).length, 12)
  assert.equal(bankCsvNodes.get('Convex — import bank statement')?.disabled, true)
  assert.match(bankCsvNodes.get('Drive — list monthly bank files')?.parameters.queryString, /name contains '\.pdf'/)
  assert.match(bankCsvNodes.get('CSV — pair with PDF')?.parameters.jsCode, /pdfFileId/)
  assert.match(bankCsvNodes.get('CSV — pair with PDF')?.parameters.jsCode, /parent\(item\).*stem\(name\)/s)
  assert.match(bankCsvNodes.get('CSV — prepare Convex payload')?.parameters.jsCode, /pdfFileName/)
  assert.equal(
    bankCsvWorkflow.connections['Bank CSV — twice daily']?.main?.[0]?.[0]?.node,
    'Drive — list monthly bank files',
  )
  assert.equal(
    bankCsvNodes.get('Bank CSV — twice daily')?.parameters.rule.interval[0].expression,
    '30 7,17 * * *',
  )
})

test('NORA monitoring export is isolated and sanitized', () => {
  assert.equal(noraMonitorWorkflow.nodes.some((node) => Object.hasOwn(node, 'credentials')), false)
  assert.match(noraMonitorSerialized, /REPLACE_WITH_NORA_WORKFLOW_ID/)
  assert.match(noraMonitorSerialized, /REPLACE_WITH_OWNER_CHAT_ID/)
  assert.match(noraMonitorSerialized, /NORA Telegram Bot|NORA Chief of Staff|NORA workflow error/)
  assert.doesNotMatch(noraMonitorSerialized, /SARA|ajAP0czttC0c9syg|JcLXUmhJ0Kevytvi|9Ynr2a9IaT5m0UJy|Rog0Z5TIQ6qSpzFX/)
})

test('finance review resolution updates the original file and register row', () => {
  assert.equal(reviewWorkflow.nodes.some((node) => Object.hasOwn(node, 'credentials')), false)
  assert.equal(/composio/i.test(reviewSerialized), false)
  assert.equal(/["']1[A-Za-z0-9_-]{20,}["']/.test(reviewSerialized), false)
  assert.equal((reviewSerialized.match(/REPLACE_WITH_2026_\d{2}_[A-Z_]+_FOLDER_ID/g) ?? []).length, 48)
  assert.match(reviewNodes.get('Drive — presuň existujúci originál')?.parameters.url, /removeParents=REPLACE_WITH_DRIVE_INTAKE_FOLDER_ID/)
  assert.match(reviewNodes.get('Priprav aktualizáciu existujúceho riadku')?.parameters.jsCode, /Doklad ID|documentId/)
  assert.match(reviewNodes.get('Priprav aktualizáciu existujúceho riadku')?.parameters.jsCode, /findIndex/)
  assert.doesNotMatch(reviewSerialized, /append/i)
  assert.equal(
    reviewNodes.get('Review — twice daily')?.parameters.rule.interval[0].expression,
    '25 7,17 * * *',
  )
})

