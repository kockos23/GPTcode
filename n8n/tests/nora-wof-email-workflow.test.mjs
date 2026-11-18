import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const load = (name) => JSON.parse(fs.readFileSync(new URL(`../workflows/${name}`, import.meta.url), 'utf8'))
const eventsImap = load('nora-wof-imap-events.pilot.json')
const expoImap = load('nora-wof-imap-expo.pilot.json')
const eventsSmtp = load('nora-wof-smtp-events.pilot.json')
const expoSmtp = load('nora-wof-smtp-expo.pilot.json')

test('WOF mail exports contain no credential bindings or secrets', () => {
  for (const workflow of [eventsImap, expoImap, eventsSmtp, expoSmtp]) {
    assert.equal(workflow.nodes.some((node) => Object.hasOwn(node, 'credentials')), false)
    assert.doesNotMatch(JSON.stringify(workflow), /password|api[_-]?key|bearer\s+[a-z0-9]/i)
  }
})

test('IMAP workflows bind a fixed account and use authenticated Convex ingestion', () => {
  for (const [workflow, account] of [
    [eventsImap, 'tomas.kocner@wofevents.com'],
    [expoImap, 'tomas.kocner@wofexpo.com'],
  ]) {
    const trigger = workflow.nodes.find((node) => node.type === 'n8n-nodes-base.emailReadImap')
    const normalize = workflow.nodes.find((node) => node.type === 'n8n-nodes-base.code')
    const ingest = workflow.nodes.find((node) => node.type === 'n8n-nodes-base.httpRequest')
    assert.ok(trigger)
    assert.match(normalize.parameters.jsCode, new RegExp(account.replaceAll('.', '\\.')))
    assert.match(normalize.parameters.jsCode, /messageId/)
    assert.match(ingest.parameters.url, /chief-of-staff\/email$/)
    assert.equal(ingest.parameters.authentication, 'genericCredentialType')
    assert.equal(ingest.parameters.genericAuthType, 'httpHeaderAuth')
    assert.equal(workflow.settings.saveDataSuccessExecution, 'none')
  }
})

test('SMTP pilots cannot send until explicitly approved and enabled', () => {
  for (const [workflow, account] of [
    [eventsSmtp, 'tomas.kocner@wofevents.com'],
    [expoSmtp, 'tomas.kocner@wofexpo.com'],
  ]) {
    const sender = workflow.nodes.find((node) => node.type === 'n8n-nodes-base.emailSend')
    assert.ok(sender)
    assert.equal(sender.disabled, true)
    assert.equal(sender.parameters.fromEmail, account)
    assert.match(JSON.stringify(workflow), /REPLACE_WITH_APPROVED_TEST_RECIPIENT/)
  }
})
