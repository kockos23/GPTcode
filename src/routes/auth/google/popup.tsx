import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"

import { useMountEffect } from "@/hooks/use-mount-effect"
import { storeGoogleAuthPopupProof } from "@/lib/google-auth-handoff"

const POPUP_READY_MESSAGE = "macaly-google-popup-ready"
const POPUP_START_MESSAGE = "macaly-google-popup-start"

export const Route = createFileRoute("/auth/google/popup")({
  component: GoogleAuthPopupPage,
})

function GoogleAuthPopupPage() {
  const [error, setError] = useState<string | null>(null)

  useMountEffect(() => {
    const opener = window.opener
    if (!opener) {
      setError("Vráť sa do aplikácie a spusti prihlásenie znova.")
      return
    }

    const announceReady = () =>
      opener.postMessage({ type: POPUP_READY_MESSAGE }, window.location.origin)
    const interval = window.setInterval(announceReady, 250)

    const handleMessage = (event: MessageEvent) => {
      const data = event.data as Record<string, unknown>
      if (
        event.origin !== window.location.origin ||
        event.source !== opener ||
        data.type !== POPUP_START_MESSAGE ||
        typeof data.flowId !== "string" ||
        typeof data.authorizationUrl !== "string" ||
        typeof data.popupVerifier !== "string"
      ) return

      const authorizationUrl = new URL(data.authorizationUrl)
      if (authorizationUrl.protocol !== "https:") return
      window.clearInterval(interval)
      window.removeEventListener("message", handleMessage)
      storeGoogleAuthPopupProof(data.flowId, data.popupVerifier)
      window.opener = null
      window.location.replace(authorizationUrl.toString())
    }

    window.addEventListener("message", handleMessage)
    announceReady()
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("message", handleMessage)
    }
  })

  return <main className="auth-screen"><section className="auth-card compact-auth-card"><p className="auth-copy" role={error ? "alert" : undefined}>{error ?? "Otváram Google prihlásenie…"}</p></section></main>
}
