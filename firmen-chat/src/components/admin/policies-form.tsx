"use client"

import { useState } from "react"
import { BotIcon, DatabaseIcon, GaugeIcon, SaveIcon, ShieldCheckIcon } from "lucide-react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Spinner } from "@/components/ui/spinner"
import { ConfirmDialog } from "@/components/app/dialogs"
import { PageHeader } from "./admin-sidebar"
import { FormField, useAction } from "./form"

type Settings = Record<
  | "system_prompt" | "store_chats" | "retention_days" | "usage_retention_days" | "redact_pii"
  | "redact_terms" | "block_terms" | "default_daily_tokens" | "banner_text",
  string
>

function Section({ icon: Icon, title, description, children }: { icon: React.ElementType; title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
          </div>
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">{children}</CardContent>
    </Card>
  )
}

function ToggleRow({ title, text, checked, onChange }: { title: string; text: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-lg border p-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground text-pretty">{text}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </label>
  )
}

export function PoliciesForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState(initial)
  const [confirm, setConfirm] = useState(false)
  const { run, pending } = useAction()
  const dirty = JSON.stringify(s) !== JSON.stringify(initial)
  const text = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setS({ ...s, [k]: e.target.value })
  const save = () => run(() => api("/api/admin/settings", { method: "PUT", body: s }), "Richtlinien gespeichert.").catch(() => {})

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (s.store_chats === "0" && initial.store_chats === "1") setConfirm(true)
        else save()
      }}
    >
      <PageHeader title="Richtlinien" description="Unternehmensweite Regeln für Datenschutz, Speicherung und Nutzung.">
        <Button type="submit" disabled={!dirty || pending}>
          {pending ? <Spinner /> : <SaveIcon />} Änderungen speichern
        </Button>
      </PageHeader>

      <Section icon={ShieldCheckIcon} title="Datenschutz" description="Gilt für alle Anfragen an externe Anbieter. Lokale Modelle sind ausgenommen.">
        <ToggleRow
          title="Personenbezogene Daten automatisch schwärzen"
          text="E-Mail-Adressen, Telefonnummern, IBAN, Kreditkarten- und Sozialversicherungsnummern werden vor dem Senden durch Platzhalter ersetzt."
          checked={s.redact_pii === "1"}
          onChange={(v) => setS({ ...s, redact_pii: v ? "1" : "0" })}
        />
        <div className="grid gap-5 md:grid-cols-2">
          <FormField label="Zusätzlich zu schwärzende Begriffe" htmlFor="redact" hint="Einer pro Zeile, z. B. Kundennamen oder Projekt-Codenamen.">
            <Textarea id="redact" rows={5} value={s.redact_terms} onChange={text("redact_terms")} placeholder={"ACME GmbH\nProjekt Falke"} />
          </FormField>
          <FormField label="Gesperrte Begriffe" htmlFor="block" hint="Nachrichten mit diesen Begriffen werden nicht an externe Anbieter gesendet.">
            <Textarea id="block" rows={5} value={s.block_terms} onChange={text("block_terms")} placeholder={"streng vertraulich\nGehaltsliste"} />
          </FormField>
        </div>
      </Section>

      <Section icon={DatabaseIcon} title="Speicherung & Aufbewahrung" description="Wie lange Chats und Protokolle auf dem Server bleiben.">
        <ToggleRow
          title="Chatverläufe speichern"
          text="Deaktiviert: Verläufe existieren nur im Browser-Tab. Beim Ausschalten werden alle gespeicherten Chats gelöscht."
          checked={s.store_chats === "1"}
          onChange={(v) => setS({ ...s, store_chats: v ? "1" : "0" })}
        />
        <div className="grid gap-5 md:grid-cols-2">
          <FormField label="Chats löschen nach (Tagen Inaktivität)" htmlFor="ret" hint="0 = nie automatisch löschen">
            <Input id="ret" type="number" min={0} value={s.retention_days} onChange={text("retention_days")} />
          </FormField>
          <FormField label="Nutzungs- und Audit-Protokoll aufbewahren (Tage)" htmlFor="uret" hint="0 = unbegrenzt">
            <Input id="uret" type="number" min={0} value={s.usage_retention_days} onChange={text("usage_retention_days")} />
          </FormField>
        </div>
      </Section>

      <Section icon={GaugeIcon} title="Kontingente" description="Begrenzt die Kosten pro Mitarbeiter. Kann pro Benutzer überschrieben werden.">
        <FormField label="Standard-Tageslimit (Tokens)" htmlFor="limit" hint="0 = unbegrenzt. Das Limit wird täglich um Mitternacht zurückgesetzt.">
          <Input id="limit" type="number" min={0} value={s.default_daily_tokens} onChange={text("default_daily_tokens")} className="max-w-xs" />
        </FormField>
      </Section>

      <Section icon={BotIcon} title="Assistent" description="Verhalten des Assistenten und Hinweise für Mitarbeiter.">
        <FormField label="System-Prompt" htmlFor="sys" hint="Gilt für alle Modelle. Legt Ton, Sprache und Regeln fest.">
          <Textarea id="sys" rows={6} value={s.system_prompt} onChange={text("system_prompt")} />
        </FormField>
        <FormField label="Hinweisbanner im Chat" htmlFor="banner" hint="Leer = kein Banner.">
          <Textarea id="banner" rows={2} value={s.banner_text} onChange={text("banner_text")} />
        </FormField>
      </Section>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Chat-Speicherung deaktivieren?"
        description="Alle gespeicherten Chats aller Mitarbeiter werden sofort und endgültig gelöscht."
        confirmLabel="Deaktivieren & löschen"
        onConfirm={async () => {
          await save()
        }}
      />
    </form>
  )
}
