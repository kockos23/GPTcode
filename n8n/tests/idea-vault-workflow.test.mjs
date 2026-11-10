import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const load = (name) => JSON.parse(fs.readFileSync(new URL('../workflows/' + name, import.meta.url), 'utf8'))
const intake = load('idea-vault-telegram-intake.pilot.json')
const digest = load('idea-vault-weekly-digest.pilot.json')
const nodes = new Map(intake.nodes.map((node) => [node.name, node]))
const digestNodes = new Map(digest.nodes.map((node) => [node.name, node]))

// Runs an n8n Code node body with a minimal stand-in for $input / $('Node') / this.helpers.
async function runCode(node, { input = [], refs = {}, binary = null } = {}) {
  const $input = { all: () => input, first: () => input[0] }
  const $ = (name) => {
    if (!(name in refs)) throw new Error('Node ' + name + ' has not executed')
    return { first: () => ({ json: refs[name] }) }
  }
  const helpers = { getBinaryDataBuffer: async () => binary }
  const fn = new Function('$input', '$', '$execution', `return (async function () {\n${node.parameters.jsCode}\n}).call(this)`)
  return fn.call({ helpers }, $input, $, { id: 'test' })
}

test('exports are inactive, sanitized and contain no credentials or Composio', () => {
  for (const wf of [intake, digest]) {
    const serialized = JSON.stringify(wf)
    assert.equal(wf.active, false)
    assert.equal(wf.nodes.some((node) => Object.hasOwn(node, 'credentials')), false)
    assert.equal(/composio/i.test(serialized), false)
    assert.equal(/sk-[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9]{16,}/.test(serialized), false)
    assert.match(serialized, /REPLACE_WITH_CONVEX_SITE_URL/)
    assert.match(serialized, /REPLACE_WITH_OWNER_TELEGRAM_CHAT_ID/)
  }
  assert.match(JSON.stringify(intake), /REPLACE_WITH_IDEA_VAULT_DRIVE_FOLDER_ID/)
})

test('every connection points to an existing node', () => {
  for (const wf of [intake, digest]) {
    const names = new Set(wf.nodes.map((node) => node.name))
    for (const [source, { main }] of Object.entries(wf.connections)) {
      assert.ok(names.has(source), source)
      for (const output of main) for (const target of output) assert.ok(names.has(target.node), target.node)
    }
  }
})

test('owner filter drops foreign chats and classifies voice, photo, PDF and links', async () => {
  const classify = nodes.get('Over vlastníka a rozpoznaj obsah')
  const owner = 'REPLACE_WITH_OWNER_TELEGRAM_CHAT_ID'
  const msg = (extra) => ({ json: { message: { message_id: 7, date: 1762600000, chat: { id: owner }, ...extra } } })
  const out = await runCode(classify, { input: [
    { json: { message: { message_id: 1, chat: { id: 999 }, text: 'cudzí' } } },
    msg({ voice: { file_id: 'V1', mime_type: 'audio/ogg', file_size: 1000 } }),
    msg({ photo: [{ file_id: 'small' }, { file_id: 'big', file_size: 500 }], caption: 'screenshot' }),
    msg({ document: { file_id: 'D1', mime_type: 'application/pdf', file_name: 'report.pdf', file_size: 30 * 1024 * 1024 } }),
    msg({ text: 'Pozri https://example.com/a.', entities: [{ type: 'text_link', url: 'https://example.com/b' }] }),
  ] })
  assert.equal(out.length, 4)
  assert.deepEqual(out.map((o) => o.json.kind), ['voice', 'image', 'document', 'link'])
  assert.equal(out[1].json.downloadFileId, 'big')
  assert.equal(out[2].json.fileTooBig, true)
  assert.equal(out[2].json.downloadFileId, '')
  assert.deepEqual(out[3].json.urls, ['https://example.com/b', 'https://example.com/a'])
  assert.equal(out[0].json.sourceKey, 'telegram:' + owner + ':7')
})

test('files are archived in Drive in parallel and voice goes through transcription', () => {
  const c = intake.connections
  assert.deepEqual(c['Telegram — stiahni súbor'].main[0].map((t) => t.node).sort(), ['Archivuj originál do Drive', 'Spoj súbor a archív'])
  assert.equal(c['Je to hlasovka?'].main[0][0].node, 'OpenAI — prepis hlasovky')
  assert.equal(c['Je to hlasovka?'].main[1][0].node, 'Priprav AI analýzu')
  assert.equal(nodes.get('Archivuj originál do Drive').onError, 'continueRegularOutput')
  assert.equal(nodes.get('OpenAI — prepis hlasovky').parameters.contentType, 'multipart-form-data')
})

test('analysis request is schema constrained and personalized with the profile', async () => {
  const prepare = nodes.get('Priprav AI analýzu')
  const base = {
    sourceKey: 'telegram:1:2', chatId: '1', messageId: 2, kind: 'image', receivedAt: 1, rawText: '', caption: 'Pricing',
    urls: [], forwardedFrom: '', telegramFileId: 'F', downloadFileId: 'F', mimeType: 'image/jpeg', fileName: 'foto.jpg',
    context: { promptContext: 'Oblasti, ktorým sa venujem:\n- AI agentúra', recent: [] }, contextError: '',
  }
  const [out] = await runCode(prepare, {
    input: [{ json: { id: 'drive123' }, binary: { data: { mimeType: 'image/jpeg' } } }],
    refs: { 'Spoj správu a profil': base, 'Spoj súbor a archív': { id: 'drive123' } },
    binary: Buffer.from('img'),
  })
  const body = out.json.requestBody
  assert.equal(body.text.format.type, 'json_schema')
  assert.equal(body.text.format.strict, true)
  assert.match(body.instructions, /AI agentúra/)
  assert.deepEqual(body.text.format.schema.required.sort(), Object.keys(body.text.format.schema.properties).sort())
  assert.equal(body.input[0].content[1].type, 'input_image')
  assert.equal(out.json.capture.driveUrl, 'https://drive.google.com/file/d/drive123/view')
})

test('a failed AI call still saves the raw capture and replies honestly', async () => {
  const build = nodes.get('Zostav záznam pre Convex')
  const reply = nodes.get('Zostav potvrdenie')
  const prepared = { chatId: '1', messageId: 2, notes: [], capture: { sourceKey: 'telegram:1:2', rawText: 'myšlienka' } }
  const [built] = await runCode(build, { input: [{ json: { error: { message: 'rate limit' } } }], refs: { 'Priprav AI analýzu': prepared } })
  assert.equal(built.json.payload.enrichment, null)
  assert.match(built.json.payload.analysisError, /rate limit/)
  const [msg] = await runCode(reply, { input: [{ json: { ok: true, title: 'myšlienka' } }], refs: { 'Zostav záznam pre Convex': built.json } })
  assert.match(msg.json.text, /bez AI analýzy/)
})

test('Convex calls use header auth and survive outages', () => {
  for (const name of ['Načítaj profil z Convex', 'Ulož do trezora (Convex)']) {
    const node = nodes.get(name)
    assert.equal(node.parameters.authentication, 'genericCredentialType')
    assert.equal(node.parameters.genericAuthType, 'httpHeaderAuth')
    assert.equal(node.onError, 'continueRegularOutput')
  }
  assert.match(nodes.get('Ulož do trezora (Convex)').parameters.url, /\/ideas\/capture$/)
})

test('weekly digest runs Monday morning and only when there is something new', () => {
  const trigger = digestNodes.get('Každý pondelok 7:40')
  assert.equal(trigger.parameters.rule.interval[0].expression, '0 40 7 * * 1')
  assert.equal(digest.connections['Pribudli nápady?'].main[0][0].node, 'Priprav týždennú syntézu')
  assert.equal(digest.connections['Pribudli nápady?'].main.length, 1)
  assert.match(digestNodes.get('Načítaj nápady za týždeň').parameters.url, /\/ideas\/digest-input\?days=7$/)
})

test('a link to a PDF is read as a document, a web page as text', async () => {
  const prepare = nodes.get('Priprav AI analýzu')
  const base = {
    sourceKey: 'telegram:1:9', chatId: '1', messageId: 9, kind: 'link', receivedAt: 1, rawText: 'pozri', caption: '',
    urls: ['https://example.com/files/Report%202026.pdf'], forwardedFrom: '', telegramFileId: '', downloadFileId: '',
    mimeType: '', fileName: '', context: { promptContext: 'P', recent: [] }, contextError: '',
  }
  const [pdf] = await runCode(prepare, {
    input: [{ json: {}, binary: { data: { mimeType: 'application/octet-stream' } } }],
    refs: { 'Spoj správu a profil': base }, binary: Buffer.from('%PDF-1.4'),
  })
  const pdfPart = pdf.json.requestBody.input[0].content[1]
  assert.equal(pdfPart.type, 'input_file')
  assert.equal(pdfPart.filename, 'Report 2026.pdf')
  assert.deepEqual(pdf.json.notes, [])

  const [html] = await runCode(prepare, {
    input: [{ json: {}, binary: { data: { mimeType: 'text/html; charset=utf-8' } } }],
    refs: { 'Spoj správu a profil': { ...base, urls: ['https://example.com/a'] } },
    binary: Buffer.from('<html><title>Ahoj</title><p>' + 'text '.repeat(60) + '</p></html>'),
  })
  assert.equal(html.json.requestBody.input[0].content.length, 1)
  assert.match(html.json.requestBody.input[0].content[0].text, /Web – názov a popis: Ahoj/)
  assert.equal(nodes.get('Stiahni webovú stránku').parameters.options.response.response.responseFormat, 'file')
})
