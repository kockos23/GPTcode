import { useAuthActions } from "@convex-dev/auth/react"
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react"
import { LockKeyhole, ShieldCheck, UserRoundX } from "lucide-react"
import * as React from "react"

import { api } from "@/convex/_generated/api"
import { GoogleAuthButton } from "@/components/google-auth-button"

export function AuthGate({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthLoading><AuthStatus title="Overujem bezpečné prihlásenie…" /></AuthLoading>
      <Unauthenticated><SignInScreen /></Unauthenticated>
      <Authenticated><OwnerOnly>{children}</OwnerOnly></Authenticated>
    </>
  )
}

function OwnerOnly({ children }: { children: React.ReactNode }) {
  const access = useQuery(api.authz.currentAccess)

  if (access === undefined) return <AuthStatus title="Overujem oprávnenie účtu…" />
  if (!access.allowed) return <ForbiddenScreen email={"email" in access ? access.email : null} />
  return <>{children}</>
}

function SignInScreen() {
  const { signIn } = useAuthActions()
  const [step, setStep] = React.useState<"choice" | "email" | "code">("choice")
  const [email, setEmail] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  const sendCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const address = String(form.get("email") ?? "").trim()
    setLoading(true)
    setError(null)
    try {
      await signIn("resend-otp", form)
      setEmail(address)
      setStep("code")
    } catch {
      setError("Kód sa nepodarilo odoslať. Skontroluj adresu a skús to znova.")
    } finally {
      setLoading(false)
    }
  }

  const verifyCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await signIn("resend-otp", new FormData(event.currentTarget))
    } catch {
      setError("Kód je neplatný alebo vypršal. Skús to znova.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-screen" data-testid="sign-in-screen" data-state="ready">
      <section className="auth-card">
        <div className="auth-brand">chief<span>.</span><small>Command HQ</small></div>
        <div className="auth-icon"><LockKeyhole size={28}/></div>
        <p className="eyebrow">Súkromný pracovný priestor</p>
        <h1>Tvoj systém.<br/><span>Za bezpečnou bránou.</span></h1>
        <p className="auth-copy">Projekty, rozhodnutia a osobné dáta sú dostupné iba po overenom prihlásení vlastníka.</p>
        {step === "choice" && <>
          <GoogleAuthButton />
          <button type="button" className="auth-cancel" onClick={() => setStep("email")}>Prihlásiť sa kódom na e-mail</button>
        </>}
        {step === "email" && <form className="space-y-3" onSubmit={sendCode}>
          <input className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white" name="email" type="email" placeholder="tomas.kocner@gmail.com" required disabled={loading}/>
          {error && <p className="auth-error">{error}</p>}
          <button className="google-auth-button" type="submit" disabled={loading}>{loading ? "Odosielam kód…" : "Poslať prihlasovací kód"}</button>
          <button type="button" className="auth-cancel" onClick={() => setStep("choice")}>Späť</button>
        </form>}
        {step === "code" && <form className="space-y-3" onSubmit={verifyCode}>
          <p className="auth-copy">Šesťmiestny kód sme poslali na {email}.</p>
          <input name="email" type="hidden" value={email}/>
          <input className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white" name="code" type="text" inputMode="numeric" pattern="\\d{6}" placeholder="000000" required disabled={loading}/>
          {error && <p className="auth-error">{error}</p>}
          <button className="google-auth-button" type="submit" disabled={loading}>{loading ? "Overujem…" : "Overiť kód"}</button>
          <button type="button" className="auth-cancel" onClick={() => { setStep("email"); setError(null) }}>Použiť inú adresu</button>
        </form>}
        <div className="auth-trust"><ShieldCheck size={15}/><span>Prístup je povolený iba pre určený účet.</span></div>
      </section>
    </main>
  )
}

function ForbiddenScreen({ email }: { email?: string | null }) {
  const { signOut } = useAuthActions()
  return (
    <main className="auth-screen" data-testid="access-denied" data-state="ready">
      <section className="auth-card compact-auth-card">
        <div className="auth-icon denied"><UserRoundX size={28}/></div>
        <p className="eyebrow">Prístup zamietnutý</p>
        <h1>Tento účet nemá oprávnenie.</h1>
        <p className="auth-copy">{email ? `Prihlásený účet: ${email}` : "Prihlásený účet nie je povoleným vlastníkom."}</p>
        <button className="google-auth-button" onClick={() => void signOut()}>Odhlásiť a použiť iný účet</button>
      </section>
    </main>
  )
}

function AuthStatus({ title }: { title: string }) {
  return (
    <main className="auth-screen">
      <section className="auth-card compact-auth-card">
        <div className="auth-icon"><LockKeyhole size={25}/></div>
        <p className="auth-copy">{title}</p>
      </section>
    </main>
  )
}

export function SignOutButton() {
  const { signOut } = useAuthActions()
  return <button className="sign-out-button" onClick={() => void signOut()}>Odhlásiť sa</button>
}
