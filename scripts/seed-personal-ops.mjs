import fs from 'node:fs'

const [filePath, mode] = process.argv.slice(2)
if (!filePath) throw new Error('Usage: node scripts/seed-personal-ops.mjs <seed.json> [--apply]')

const seed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
const collections = [
  ['assets', 'assets'],
  ['subscriptions', 'subscriptions'],
  ['maintenance', 'maintenance'],
]

const rows = collections.flatMap(([key, endpoint]) =>
  (Array.isArray(seed[key]) ? seed[key] : []).map(payload => ({ endpoint, payload })),
)

const serialized = JSON.stringify(rows)
const hasPlaceholders = /REPLACE_WITH_/.test(serialized)

if (mode !== '--apply') {
  process.stdout.write(JSON.stringify({ ok: true, dryRun: true, ready: !hasPlaceholders, rows: rows.length, endpoints: [...new Set(rows.map(row => row.endpoint))] }) + '\n')
  process.exit(0)
}

if (hasPlaceholders) throw new Error('Seed still contains REPLACE_WITH_ placeholders')

const baseUrl = String(process.env.PERSONAL_OPS_BASE_URL || '').replace(/\/$/, '')
const secret = String(process.env.PERSONAL_OPS_INTEGRATION_SECRET || '')
if (!/^https:\/\//.test(baseUrl) || !secret) throw new Error('PERSONAL_OPS_BASE_URL and PERSONAL_OPS_INTEGRATION_SECRET are required')

for (const row of rows) {
  const response = await fetch(`${baseUrl}/integrations/n8n/personal-ops/${row.endpoint}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify(row.payload),
  })
  if (!response.ok) throw new Error(`Seed failed for ${row.endpoint}: HTTP ${response.status}`)
}

process.stdout.write(JSON.stringify({ ok: true, dryRun: false, rows: rows.length }) + '\n')
