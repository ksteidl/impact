"use client"

import { CodeIcon, LanguagesIcon, MailIcon, ListChecksIcon } from "lucide-react"

const SUGGESTIONS = [
  { icon: MailIcon, title: "E-Mail formulieren", prompt: "Formuliere eine freundliche, professionelle E-Mail an einen Kunden, in der ich einen Liefertermin um eine Woche verschiebe." },
  { icon: ListChecksIcon, title: "Text zusammenfassen", prompt: "Fasse den folgenden Text in 5 Stichpunkten zusammen und nenne am Ende die wichtigste Handlungsempfehlung:\n\n" },
  { icon: LanguagesIcon, title: "Übersetzen", prompt: "Übersetze den folgenden Text ins Englische, im Ton passend für Geschäftskorrespondenz:\n\n" },
  { icon: CodeIcon, title: "Excel-Formel erklären", prompt: "Erkläre mir Schritt für Schritt, was diese Excel-Formel macht: " },
]

function greeting() {
  const h = new Date().getHours()
  return h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend"
}

export function EmptyState({ name, onPick }: { name: string; onPick: (prompt: string) => void }) {
  const first = name.split(" ")[0]
  return (
    <div className="mx-auto my-auto w-full max-w-3xl px-4 py-8">
      <h1 suppressHydrationWarning className="bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
        {greeting()}, {first}.
      </h1>
      <p className="mt-2 text-lg text-muted-foreground">Womit kann ich Ihnen heute helfen?</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={s.title}
            type="button"
            onClick={() => onPick(s.prompt)}
            className={`group items-start gap-3 rounded-xl ${i >= 2 ? "hidden sm:flex" : "flex"} border bg-card/60 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card hover:shadow-md focus-visible:ring-4 focus-visible:ring-ring/20 focus-visible:outline-none`}
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <s.icon className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{s.title}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{s.prompt.trim()}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
