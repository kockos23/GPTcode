import { spawnSync } from "node:child_process"
import { exportJWK, exportPKCS8, generateKeyPair } from "jose"

function convexEnv(args, { capture = false } = {}) {
  return spawnSync("npx", ["convex", "env", ...args], {
    encoding: "utf8",
    env: process.env,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  })
}

function readEnv(name) {
  const result = convexEnv(["get", name], { capture: true })
  if (result.status === 0) return result.stdout.trim()
  if (/not found|does not exist|is not set/i.test(result.stderr)) return ""
  throw new Error(`Unable to inspect Convex environment variable ${name}`)
}

if (!process.env.CONVEX_DEPLOY_KEY) {
  throw new Error("CONVEX_DEPLOY_KEY is required")
}

const existingPrivateKey = readEnv("JWT_PRIVATE_KEY")
const existingJwks = readEnv("JWKS")

if (Boolean(existingPrivateKey) !== Boolean(existingJwks)) {
  throw new Error("Convex Auth key configuration is incomplete; refusing to rotate only one key")
}

if (existingPrivateKey && existingJwks) {
  console.log("Convex Auth signing keys are already configured")
  process.exit(0)
}

const keys = await generateKeyPair("RS256")
const privateKey = (await exportPKCS8(keys.privateKey)).trimEnd().replace(/\n/g, " ")
const publicKey = await exportJWK(keys.publicKey)
const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] })

for (const [name, value] of [["JWT_PRIVATE_KEY", privateKey], ["JWKS", jwks]]) {
  const result = convexEnv(["set", name, value])
  if (result.status !== 0) throw new Error(`Unable to configure ${name}`)
}

console.log("Convex Auth signing keys configured")
