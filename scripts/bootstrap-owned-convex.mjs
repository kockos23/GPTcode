import { createPublicKey, generateKeyPairSync } from "node:crypto"

const deploymentUrl = "https://calm-alligator-455.eu-west-1.convex.cloud"
const deployKey = process.env.CONVEX_DEPLOY_KEY

if (!deployKey) throw new Error("CONVEX_DEPLOY_KEY is not configured")

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
})
const publicJwk = createPublicKey(publicKey).export({ format: "jwk" })
const jwtPrivateKey = privateKey.trimEnd().replace(/\n/g, " ")
const jwks = JSON.stringify({ keys: [{ ...publicJwk, use: "sig", alg: "RS256" }] })

const response = await fetch(`${deploymentUrl}/api/update_environment_variables`, {
  method: "POST",
  headers: {
    Authorization: `Convex ${deployKey}`,
    "Content-Type": "application/json",
    "Convex-Client": "chief-of-staff-bootstrap",
  },
  body: JSON.stringify({
    changes: [
      { name: "OWNER_EMAIL", value: "tomas.kocner@gmail.com" },
      { name: "APP_NAME", value: "Chief of Staff HQ" },
      { name: "JWT_PRIVATE_KEY", value: jwtPrivateKey },
      { name: "JWKS", value: jwks },
    ],
  }),
})

if (!response.ok) {
  throw new Error(`Convex bootstrap failed with HTTP ${response.status}`)
}

console.log("Convex owner identity and authentication signing keys configured.")
