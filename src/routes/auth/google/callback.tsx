import { useAuthActions } from "@convex-dev/auth/react"
import { useAction } from "convex/react"
import { createFileRoute } from "@tanstack/react-router"
import { useRef, useState } from "react"

import { api } from "@/convex/_generated/api"
import { useMountEffect } from "@/hooks/use-mount-effect"
import {
  describeGoogleAuthError,
  takeGoogleAuthHandoff,
  takeGoogleAuthPopupProof,
} from "@/lib/google-auth-handoff"

export const Route = createFileRoute("/auth/google/callback")({
  component: GoogleAuthCallbackPage,
})

function GoogleAuthCallbackPage() {
  const { signIn } = useAuthActions()
  const completeAuthorizationPopup = useAction(api.googleAuth.completeAuthorizationPopup)
  const handled = useRef(false)
  const [error, setError] = useState<string | null>(null)

  useMountEffect(() => {
    if (handled.current) return
    handled.current = true
    const params = new URLSearchParams(window.location.hash.slice(1))
    const grant = params.get("macaly_google_grant")
    const oauthError = params.get("macaly_google_error")
    const flowId = params.get("macaly_google_flow")
    window.history.replaceState(null, "", window.location.pathname)

    if (flowId) {
      const popupVerifier = takeGoogleAuthPopupProof(flowId)
      if (!grant || !popupVerifier || oauthError) {
        setError("Google prihlásenie zlyhalo. Vráť sa do aplikácie a skús to znova.")
        return
      }
      void completeAuthorizationPopup({ flowId, grant, popupVerifier })
        .then(() => window.close())
        .catch(() => setError("Google prihlásenie zlyhalo. Vráť sa do aplikácie a skús to znova."))
      return
    }

    const handoff = takeGoogleAuthHandoff()
    if (!grant || !handoff || oauthError) {
      setError(oauthError === "access_denied" ? "Google prihlásenie bolo zrušené." : "Google prihlásenie zlyhalo.")
      return
    }

    void signIn("macaly-google", {
      grant,
      handoffVerifier: handoff.verifier,
      linkToCurrentUser: handoff.mode === "link",
    })
      .then(() => window.location.replace("/"))
      .catch((caught) => setError(describeGoogleAuthError(caught, handoff.mode)))
  })

  return (
    <main className="auth-screen">
      <section className="auth-card compact-auth-card">
        <p className="auth-copy" role={error ? "alert" : undefined}>{error ?? "Dokončujem bezpečné prihlásenie…"}</p>
        {error && <a className="auth-retry" href="/">Skúsiť prihlásenie znova</a>}
      </section>
    </main>
  )
}
