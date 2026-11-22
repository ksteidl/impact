"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRightIcon, CircleAlertIcon, KeyRoundIcon } from "lucide-react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"

export function LoginForm({ initialStep }: { initialStep: "login" | "password" }) {
  const router = useRouter()
  const [step, setStep] = useState(initialStep)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [repeat, setRepeat] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setBusy(true)
    try {
      const r = await api<{ mustChangePassword: boolean }>("/api/auth/login", { method: "POST", body: { username, password } })
      if (r.mustChangePassword) {
        setCurrent(password)
        setStep("password")
      } else {
        router.replace("/")
        router.refresh()
      }
    } catch (ex) {
      setError((ex as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (next !== repeat) return setError("Die neuen Passwörter stimmen nicht überein.")
    setBusy(true)
    try {
      await api("/api/me/password", { method: "POST", body: { currentPassword: current, newPassword: next } })
      router.replace("/")
      router.refresh()
    } catch (ex) {
      setError((ex as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const errorBox = error && (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  )

  if (step === "password") {
    return (
      <form onSubmit={changePassword} className="space-y-6">
        <div className="space-y-2">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <KeyRoundIcon className="size-5" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Eigenes Passwort festlegen</h2>
          <p className="text-sm text-muted-foreground">
            Mindestens 10 Zeichen und 3 von: Klein- und Großbuchstaben, Ziffern, Sonderzeichen.
          </p>
        </div>
        <div className="space-y-4">
          {!current && (
            <div className="space-y-2">
              <Label htmlFor="current">Aktuelles Passwort</Label>
              <Input id="current" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="new">Neues Passwort</Label>
            <Input id="new" type="password" autoComplete="new-password" required minLength={10} autoFocus value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="repeat">Neues Passwort wiederholen</Label>
            <Input id="repeat" type="password" autoComplete="new-password" required minLength={10} value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          </div>
        </div>
        {errorBox}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? <Spinner /> : null} Passwort speichern
        </Button>
      </form>
    )
  }

  return (
    <form onSubmit={login} className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">Willkommen zurück</h2>
        <p className="text-sm text-muted-foreground">Melden Sie sich mit Ihrem Firmenkonto an.</p>
      </div>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="username">Benutzername</Label>
          <Input id="username" autoComplete="username" required autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Passwort</Label>
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
      </div>
      {errorBox}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? <Spinner /> : null} Anmelden {!busy && <ArrowRightIcon />}
      </Button>
    </form>
  )
}
