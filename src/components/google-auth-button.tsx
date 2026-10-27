import { useAuthActions } from "@convex-dev/auth/react"
import { useAction } from "convex/react"
import { useRef, useState } from "react"
import { ArrowRight, LoaderCircle, X } from "lucide-react"

import { api } from "@/convex/_generated/api"
import {
  createGoogleAuthChallenge,
  createGoogleAuthHandoff,
  createGoogleAuthVerifier,
  describeGoogleAuthError,
  takeGoogleAuthHandoff,
  type GoogleAuthHandoffMode,
} from "@/lib/google-auth-handoff"

const POPUP_POLL_INTERVAL_MS = 2_000
const POPUP_TIMEOUT_MS = 10 * 60 * 1000
const POPUP_READY_TIMEOUT_MS = 10_000
const POPUP_READY_MESSAGE = "macaly-google-popup-ready"
const POPUP_START_MESSAGE = "macaly-google-popup-start"

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function openGoogleAuthPopup(): Window | null {
  const width = 520
  const height = 720
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2)
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2)
  return window.open(
    "/auth/google/popup",
    "_blank",
    `popup=yes,width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)}`,
  )
}

function waitForGoogleAuthPopup(authWindow: Window): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", handleMessage)
      reject(new Error("Google sign-in popup timed out"))
    }, POPUP_READY_TIMEOUT_MS)

    function handleMessage(event: MessageEvent) {
      if (
        event.origin !== window.location.origin ||
        event.source !== authWindow ||
        event.data?.type !== POPUP_READY_MESSAGE
      ) return

      window.clearTimeout(timeout)
      window.removeEventListener("message", handleMessage)
      resolve()
    }

    window.addEventListener("message", handleMessage)
  })
}

export function GoogleAuthButton({ mode = "sign-in" }: { mode?: GoogleAuthHandoffMode }) {
  const { signIn } = useAuthActions()
  const createAuthorizationUrl = useAction(api.googleAuth.createAuthorizationUrl)
  const getAuthorizationStatus = useAction(api.googleAuth.getAuthorizationStatus)
  const attempt = useRef(0)
  const popup = useRef<Window | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const start = async () => {
    const attemptId = ++attempt.current
    setError(null)
    setLoading(true)
    let authWindow: Window | null = null

    try {
      const flowMode = window.top === window ? "redirect" : "popup"
      const handoffChallengePromise = createGoogleAuthHandoff(mode)
      const popupVerifier = flowMode === "popup" ? createGoogleAuthVerifier() : null
      const popupChallengePromise = popupVerifier
        ? createGoogleAuthChallenge(popupVerifier)
        : Promise.resolve(null)
      let popupReady: Promise<void> | null = null

      if (flowMode === "popup") {
        authWindow = openGoogleAuthPopup()
        if (!authWindow) throw new Error("Google sign-in popup was blocked")
        popup.current = authWindow
        popupReady = waitForGoogleAuthPopup(authWindow)
      }

      const [handoffChallenge, popupChallenge] = await Promise.all([
        handoffChallengePromise,
        popupChallengePromise,
      ])
      const authorizationPromise = createAuthorizationUrl({
        appOrigin: window.location.origin,
        handoffChallenge,
        flowMode,
        ...(popupChallenge ? { popupChallenge } : {}),
      })
      const authorization = authWindow
        ? (await Promise.all([
            authorizationPromise,
            popupReady ?? Promise.reject(new Error("Google popup failed")),
          ]))[0]
        : await authorizationPromise

      if (authWindow && popupVerifier) {
        authWindow.postMessage(
          {
            type: POPUP_START_MESSAGE,
            flowId: authorization.flowId,
            authorizationUrl: authorization.authorizationUrl,
            popupVerifier,
          },
          window.location.origin,
        )
      } else {
        window.location.href = authorization.authorizationUrl
      }

      if (!authWindow) return

      const deadline = Date.now() + POPUP_TIMEOUT_MS
      while (attempt.current === attemptId && Date.now() < deadline) {
        const status = await getAuthorizationStatus({ flowId: authorization.flowId })
        if (status.status === "pending") {
          await wait(POPUP_POLL_INTERVAL_MS)
          continue
        }

        const handoff = takeGoogleAuthHandoff()
        if (status.status === "error") {
          throw new Error(
            status.error === "access_denied"
              ? "Google sign-in was cancelled."
              : "Google sign-in failed.",
          )
        }
        if (!handoff) throw new Error("Google sign-in handoff expired.")

        await signIn("macaly-google", {
          grant: status.grant,
          handoffVerifier: handoff.verifier,
          linkToCurrentUser: handoff.mode === "link",
        })
        authWindow.close()
        popup.current = null
        setLoading(false)
        return
      }

      if (attempt.current === attemptId) {
        throw new Error("Google sign-in timed out. Please try again.")
      }
    } catch (caught) {
      if (attempt.current !== attemptId) return
      authWindow?.close()
      popup.current = null
      takeGoogleAuthHandoff()
      setError(describeGoogleAuthError(caught, mode))
      setLoading(false)
    }
  }

  const cancel = () => {
    attempt.current += 1
    popup.current?.close()
    popup.current = null
    takeGoogleAuthHandoff()
    setLoading(false)
    setError(null)
  }

  return (
    <div className="google-auth-actions">
      <button type="button" className="google-auth-button" data-testid="google-sign-in" onClick={() => void start()} disabled={loading}>
        {loading ? <LoaderCircle className="spin" size={18}/> : <span className="google-mark">G</span>}
        <span>{loading ? "Otváram Google…" : mode === "link" ? "Prepojiť Google účet" : "Pokračovať cez Google"}</span>
        {!loading && <ArrowRight size={17}/>}
      </button>
      {loading && (
        <button type="button" className="auth-cancel" onClick={cancel}>
          <X size={14}/> Zrušiť
        </button>
      )}
      {error && <p className="auth-error" role="alert">{error}</p>}
    </div>
  )
}
