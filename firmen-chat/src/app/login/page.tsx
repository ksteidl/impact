import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { LockKeyholeIcon, ShieldCheckIcon, SparklesIcon, LayersIcon } from "lucide-react"
import { currentUser } from "@/server/http"
import { Logo } from "@/components/app/logo"
import { LoginForm } from "./login-form"

export const metadata: Metadata = { title: "Anmelden" }

const FEATURES = [
  { icon: LayersIcon, title: "Alle führenden Modelle", text: "Claude, GPT, Gemini, Mistral und lokale Modelle an einem Ort." },
  { icon: ShieldCheckIcon, title: "Datenschutz eingebaut", text: "Personenbezogene Daten werden vor externen Anbietern automatisch geschwärzt." },
  { icon: LockKeyholeIcon, title: "Im eigenen Haus betrieben", text: "Zugänge, Modelle und Richtlinien steuert Ihre IT." },
]

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await currentUser()
  const sp = await searchParams
  const changePassword = sp.pw !== undefined || !!user?.must_change_pw
  if (user && !user.must_change_pw) redirect("/")

  return (
    <main className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -top-40 -right-40 size-[32rem] rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-48 -left-24 size-[28rem] rounded-full bg-violet-400/20 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/25 backdrop-blur">
            <SparklesIcon className="size-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Firmen-Chat</span>
        </div>
        <div className="relative mt-auto max-w-md space-y-8">
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight text-balance">Ihr KI-Assistent – sicher im Unternehmen.</h1>
            <p className="text-lg text-indigo-100/90 text-pretty">
              Schreiben, analysieren, programmieren und recherchieren mit den besten Modellen, unter Kontrolle Ihrer IT.
            </p>
          </div>
          <ul className="space-y-4">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-white/10 ring-1 ring-white/20">
                  <f.icon className="size-4" />
                </div>
                <div>
                  <p className="font-medium">{f.title}</p>
                  <p className="text-sm text-indigo-100/80">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-indigo-200/70">Interne Anwendung · Zugriff nur für Mitarbeiter</p>
      </section>

      <section className="fc-glow flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm space-y-8">
          <Logo className="lg:hidden" />
          <LoginForm initialStep={changePassword && user ? "password" : "login"} />
          <p className="text-center text-xs text-muted-foreground text-pretty">
            Nutzung wird gemäß Betriebsvereinbarung protokolliert – nur Metadaten, keine Inhalte.
          </p>
        </div>
      </section>
    </main>
  )
}
