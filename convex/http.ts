import { httpRouter } from "convex/server"
import { auth } from "./auth"
import { httpCapture, httpContext, httpDigest, httpDigestInput } from "./ideaVault"

const http = httpRouter()

auth.addHttpRoutes(http)

// Idea Vault – volá iba n8n s hlavičkou Authorization: Bearer IDEA_VAULT_INGEST_TOKEN.
http.route({ path: "/ideas/context", method: "GET", handler: httpContext })
http.route({ path: "/ideas/capture", method: "POST", handler: httpCapture })
http.route({ path: "/ideas/digest-input", method: "GET", handler: httpDigestInput })
http.route({ path: "/ideas/digest", method: "POST", handler: httpDigest })

export default http
