"use client"

import { useEffect, useMemo, useState } from "react"
import {
  CheckCircle2Icon, DownloadCloudIcon, KeyRoundIcon, LockIcon, GlobeIcon, MoreHorizontalIcon, PencilIcon, PlugZapIcon,
  PlusIcon, ServerIcon, Trash2Icon, XCircleIcon,
} from "lucide-react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, CardAction } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ConfirmDialog } from "@/components/app/dialogs"
import { ProviderIcon } from "@/components/chat/provider-icon"
import { PageHeader } from "./admin-sidebar"
import { FormField, useAction } from "./form"
import type { AdminProvider } from "@/server/admin"
import type { ProviderType } from "@/lib/types"

// Vorlagen für gängige Anbieter. Außer Anthropic und Azure sprechen alle das OpenAI-kompatible Protokoll.
const PRESETS: { key: string; name: string; hint: string; type: ProviderType; baseUrl: string; local?: boolean; apiVersion?: string }[] = [
  { key: "anthropic", name: "Anthropic", hint: "Claude Opus, Sonnet, Haiku", type: "anthropic", baseUrl: "" },
  { key: "openai", name: "OpenAI", hint: "GPT-Modelle", type: "openai", baseUrl: "" },
  { key: "gemini", name: "Google Gemini", hint: "Gemini Pro & Flash", type: "openai-compatible", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/" },
  { key: "azure", name: "Azure OpenAI", hint: "GPT in Ihrer Azure-Region (EU möglich)", type: "azure", baseUrl: "https://IHRE-RESSOURCE.openai.azure.com", apiVersion: "2024-10-21" },
  { key: "mistral", name: "Mistral AI", hint: "Europäischer Anbieter", type: "openai-compatible", baseUrl: "https://api.mistral.ai/v1" },
  { key: "xai", name: "xAI", hint: "Grok", type: "openai-compatible", baseUrl: "https://api.x.ai/v1" },
  { key: "deepseek", name: "DeepSeek", hint: "DeepSeek Chat & Reasoner", type: "openai-compatible", baseUrl: "https://api.deepseek.com/v1" },
  { key: "groq", name: "Groq", hint: "Sehr schnelle Open-Source-Modelle", type: "openai-compatible", baseUrl: "https://api.groq.com/openai/v1" },
  { key: "openrouter", name: "OpenRouter", hint: "Hunderte Modelle über einen Zugang", type: "openai-compatible", baseUrl: "https://openrouter.ai/api/v1" },
  { key: "ollama", name: "Ollama (lokal)", hint: "Eigene Modelle im Firmennetz", type: "openai-compatible", baseUrl: "http://ollama:11434/v1", local: true },
  { key: "vllm", name: "vLLM / LM Studio (lokal)", hint: "Eigener Inferenz-Server", type: "openai-compatible", baseUrl: "http://localhost:8000/v1", local: true },
  { key: "custom", name: "Eigener Endpunkt", hint: "Jede OpenAI-kompatible API", type: "openai-compatible", baseUrl: "" },
]

const TYPE_LABEL: Record<ProviderType, string> = {
  anthropic: "Anthropic-API",
  openai: "OpenAI-API",
  azure: "Azure OpenAI",
  "openai-compatible": "OpenAI-kompatibel",
}

type Draft = { name: string; type: ProviderType; baseUrl: string; apiKey: string; apiVersion: string; local: boolean; enabled: boolean }

// ---------- Anlegen / Bearbeiten ----------
function ProviderDialog({ open, onOpenChange, provider }: { open: boolean; onOpenChange: (o: boolean) => void; provider?: AdminProvider }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">{open && <ProviderFlow provider={provider} close={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  )
}

function ProviderFlow({ provider, close }: { provider?: AdminProvider; close: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(
    provider
      ? { name: provider.name, type: provider.type, baseUrl: provider.baseUrl, apiKey: "", apiVersion: provider.apiVersion, local: provider.local, enabled: provider.enabled }
      : null
  )
  const { run, pending } = useAction()

  if (!draft) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Anbieter hinzufügen</DialogTitle>
          <DialogDescription>Wählen Sie eine Vorlage. Alle Felder lassen sich danach anpassen.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setDraft({ name: p.name, type: p.type, baseUrl: p.baseUrl, apiKey: "", apiVersion: p.apiVersion ?? "", local: !!p.local, enabled: true })}
              className="flex items-start gap-3 rounded-xl border p-3 text-left transition-all hover:border-primary/40 hover:bg-accent/50 focus-visible:ring-4 focus-visible:ring-ring/20 focus-visible:outline-none"
            >
              <ProviderIcon name={p.name} local={p.local} className="size-8 rounded-lg" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.hint}</p>
              </div>
            </button>
          ))}
        </div>
      </>
    )
  }

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [k]: e.target.value })
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        await run(
          () =>
            provider
              ? api(`/api/admin/providers/${provider.id}`, { method: "PUT", body: draft })
              : api("/api/admin/providers", { method: "POST", body: draft }),
          provider ? "Anbieter gespeichert." : "Anbieter angelegt – jetzt Modelle abrufen."
        ).then(close, () => {})
      }}
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3">
          <ProviderIcon name={draft.name || "?"} local={draft.local} className="size-8 rounded-lg" />
          {provider ? `${provider.name} bearbeiten` : draft.name || "Neuer Anbieter"}
        </DialogTitle>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Name" htmlFor="p-name">
          <Input id="p-name" value={draft.name} onChange={set("name")} required />
        </FormField>
        <FormField label="Protokoll">
          <Select value={draft.type} onValueChange={(v) => setDraft({ ...draft, type: v as ProviderType })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TYPE_LABEL).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>
      <FormField label="Basis-URL" htmlFor="p-url" hint="Leer = Standard-Endpunkt von OpenAI bzw. Anthropic. Für Gateways, Proxys und lokale Server ausfüllen.">
        <Input id="p-url" value={draft.baseUrl} onChange={set("baseUrl")} placeholder="https://…" className="font-mono text-sm" />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <FormField
          label={provider?.hasKey ? "Neuer API-Schlüssel" : "API-Schlüssel"}
          htmlFor="p-key"
          hint={provider?.hasKey ? "Leer lassen, um den gespeicherten Schlüssel zu behalten." : "Wird mit AES-256-GCM verschlüsselt gespeichert und nie wieder angezeigt."}
        >
          <Input id="p-key" type="password" autoComplete="new-password" value={draft.apiKey} onChange={set("apiKey")} placeholder={provider?.hasKey ? "••••••••  (gespeichert)" : draft.local ? "meist nicht nötig" : "sk-…"} />
        </FormField>
        {draft.type === "azure" && (
          <FormField label="API-Version" htmlFor="p-ver">
            <Input id="p-ver" value={draft.apiVersion} onChange={set("apiVersion")} placeholder="2024-10-21" className="w-36" />
          </FormField>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-start justify-between gap-3 rounded-lg border p-3">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <LockIcon className="size-3.5 text-success" /> Lokal im Firmennetz
            </p>
            <p className="text-xs text-muted-foreground">Daten verlassen das Unternehmen nicht – keine Schwärzung nötig.</p>
          </div>
          <Switch checked={draft.local} onCheckedChange={(v) => setDraft({ ...draft, local: v })} />
        </label>
        <label className="flex items-start justify-between gap-3 rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Aktiv</p>
            <p className="text-xs text-muted-foreground">Inaktive Anbieter blenden alle ihre Modelle aus.</p>
          </div>
          <Switch checked={draft.enabled} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} />
        </label>
      </div>
      <DialogFooter>
        {!provider && (
          <Button type="button" variant="ghost" className="mr-auto" onClick={() => setDraft(null)}>
            Andere Vorlage
          </Button>
        )}
        <Button type="button" variant="outline" onClick={close}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />} Speichern
        </Button>
      </DialogFooter>
    </form>
  )
}

// ---------- Modelle abrufen ----------
type Found = { id: string; name: string; added: boolean }

function DiscoverDialog({ provider, onOpenChange }: { provider: AdminProvider | null; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={!!provider} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">{provider && <DiscoverBody provider={provider} close={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  )
}

function DiscoverBody({ provider, close }: { provider: AdminProvider; close: () => void }) {
  const [list, setList] = useState<Found[] | null>(null)
  const [error, setError] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState("")
  const [departments, setDepartments] = useState("")
  const { run, pending } = useAction()

  useEffect(() => {
    let alive = true
    api<Found[]>(`/api/admin/providers/${provider.id}/discover`, { method: "POST", body: {} }).then(
      (r) => alive && setList(r),
      (e) => alive && setError(e.message)
    )
    return () => {
      alive = false
    }
  }, [provider.id])

  const visible = useMemo(() => (list ?? []).filter((m) => m.id.toLowerCase().includes(filter.toLowerCase())), [list, filter])
  const selectable = visible.filter((m) => !m.added)
  const allChecked = selectable.length > 0 && selectable.every((m) => selected.has(m.id))

  return (
    <>
      <DialogHeader>
        <DialogTitle>Modelle von {provider.name}</DialogTitle>
        <DialogDescription>Wählen Sie die Modelle, die Mitarbeitern zur Verfügung stehen sollen.</DialogDescription>
      </DialogHeader>
      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <XCircleIcon className="mt-0.5 size-4 shrink-0" /> {error}
        </div>
      ) : !list ? (
        <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Modelle werden abgerufen …
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="flex items-center gap-2">
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`${list.length} Modelle filtern …`} />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const next = new Set(selected)
                for (const m of selectable) {
                  if (allChecked) next.delete(m.id)
                  else next.add(m.id)
                }
                setSelected(next)
              }}
            >
              {allChecked ? "Keine" : "Alle"}
            </Button>
          </div>
          <ScrollArea className="h-72 rounded-lg border">
            <div className="divide-y">
              {visible.map((m) => (
                <label key={m.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/50 has-disabled:cursor-default has-disabled:opacity-60">
                  <Checkbox
                    checked={m.added || selected.has(m.id)}
                    disabled={m.added}
                    onCheckedChange={(v) => {
                      const next = new Set(selected)
                      if (v) next.add(m.id)
                      else next.delete(m.id)
                      setSelected(next)
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm">{m.id}</p>
                    {m.name !== m.id && <p className="truncate text-xs text-muted-foreground">{m.name}</p>}
                  </div>
                  {m.added && <Badge variant="secondary">übernommen</Badge>}
                </label>
              ))}
            </div>
          </ScrollArea>
          <FormField label="Freigeben für Abteilungen" htmlFor="d-dep" hint="Leer = alle Mitarbeiter. Lässt sich später pro Modell ändern.">
            <Input id="d-dep" value={departments} onChange={(e) => setDepartments(e.target.value)} placeholder="z. B. IT, Marketing" />
          </FormField>
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Schließen
        </Button>
        <Button
          disabled={!selected.size || pending}
          onClick={() =>
            run(
              () =>
                api("/api/admin/models", {
                  method: "POST",
                  body: {
                    providerId: provider.id,
                    models: (list ?? []).filter((m) => selected.has(m.id)).map((m) => ({ modelId: m.id, displayName: m.name, allowedDepartments: departments })),
                  },
                }),
              `${selected.size} Modell(e) übernommen.`
            ).then(close, () => {})
          }
        >
          {pending && <Spinner />} {selected.size ? `${selected.size} übernehmen` : "Übernehmen"}
        </Button>
      </DialogFooter>
    </>
  )
}

// ---------- Verbindungstest ----------
function TestDialog({ provider, onOpenChange }: { provider: AdminProvider | null; onOpenChange: (o: boolean) => void }) {
  const [modelId, setModelId] = useState("")
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <Dialog
      open={!!provider}
      onOpenChange={(o) => {
        if (!o) setState(null)
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            setState(null)
            try {
              const r = await api<{ reply: string; ms: number }>(`/api/admin/providers/${provider!.id}/test`, { method: "POST", body: { modelId } })
              setState({ ok: true, text: `Antwort „${r.reply.trim()}“ nach ${(r.ms / 1000).toFixed(1)} s` })
            } catch (ex) {
              setState({ ok: false, text: (ex as Error).message })
            } finally {
              setBusy(false)
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Verbindung testen</DialogTitle>
            <DialogDescription>Sendet eine kurze Testnachricht an {provider?.name}.</DialogDescription>
          </DialogHeader>
          <FormField label="Modell-ID" htmlFor="t-model">
            <Input id="t-model" value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="z. B. claude-haiku-5-5" required className="font-mono" autoFocus />
          </FormField>
          {state && (
            <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${state.ok ? "border-success/30 bg-success/5 text-success" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>
              {state.ok ? <CheckCircle2Icon className="mt-0.5 size-4 shrink-0" /> : <XCircleIcon className="mt-0.5 size-4 shrink-0" />}
              <span className="break-all">{state.text}</span>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={busy || !modelId}>
              {busy ? <Spinner /> : <PlugZapIcon />} Test senden
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Seite ----------
export function ProvidersManager({ providers }: { providers: AdminProvider[] }) {
  const [dialog, setDialog] = useState(false)
  const [editing, setEditing] = useState<AdminProvider | undefined>()
  const [discover, setDiscover] = useState<AdminProvider | null>(null)
  const [testing, setTesting] = useState<AdminProvider | null>(null)
  const [deleting, setDeleting] = useState<AdminProvider | null>(null)
  const { run } = useAction()

  const openNew = () => {
    setEditing(undefined)
    setDialog(true)
  }

  return (
    <>
      <PageHeader title="Anbieter" description="KI-Anbieter und lokale Modell-Server. API-Schlüssel bleiben verschlüsselt auf dem Server.">
        <Button onClick={openNew}>
          <PlusIcon /> Anbieter hinzufügen
        </Button>
      </PageHeader>

      {providers.length === 0 ? (
        <Card>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ServerIcon />
              </EmptyMedia>
              <EmptyTitle>Noch kein Anbieter verbunden</EmptyTitle>
              <EmptyDescription>Verbinden Sie z. B. Anthropic, OpenAI, Google Gemini oder einen lokalen Ollama-Server.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={openNew}>
                <PlusIcon /> Ersten Anbieter hinzufügen
              </Button>
            </EmptyContent>
          </Empty>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {providers.map((p) => (
            <Card key={p.id} className={p.enabled ? "" : "opacity-60"}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <ProviderIcon name={p.name} local={p.local} className="size-10 rounded-xl text-sm" />
                  <div className="min-w-0">
                    <CardTitle className="truncate">{p.name}</CardTitle>
                    <CardDescription>{TYPE_LABEL[p.type]}</CardDescription>
                  </div>
                </div>
                <CardAction>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8" aria-label="Aktionen">
                        <MoreHorizontalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setTesting(p)}>
                        <PlugZapIcon /> Verbindung testen
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          setEditing(p)
                          setDialog(true)
                        }}
                      >
                        <PencilIcon /> Bearbeiten
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(p)}>
                        <Trash2Icon /> Löschen
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-1.5">
                  {p.local ? (
                    <Badge variant="outline" className="gap-1 border-success/30 bg-success/10 text-success">
                      <LockIcon className="size-3" /> Lokal
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 border-warning/30 bg-warning/10 text-warning">
                      <GlobeIcon className="size-3" /> Extern
                    </Badge>
                  )}
                  <Badge variant="outline" className="gap-1">
                    <KeyRoundIcon className="size-3" /> {p.hasKey ? "Schlüssel hinterlegt" : "Kein Schlüssel"}
                  </Badge>
                  {!p.enabled && <Badge variant="secondary">Inaktiv</Badge>}
                </div>
                <p className="truncate font-mono text-xs text-muted-foreground" title={p.baseUrl}>
                  {p.baseUrl || "Standard-Endpunkt"}
                </p>
              </CardContent>
              <CardFooter className="mt-auto justify-between border-t">
                <span className="text-sm text-muted-foreground">
                  {p.modelCount} {p.modelCount === 1 ? "Modell" : "Modelle"} übernommen
                </span>
                <Button size="sm" variant="secondary" onClick={() => setDiscover(p)} disabled={p.type === "azure"} title={p.type === "azure" ? "Bei Azure Deployments manuell unter „Modelle“ anlegen" : undefined}>
                  <DownloadCloudIcon /> Modelle abrufen
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <ProviderDialog open={dialog} onOpenChange={setDialog} provider={editing} />
      <DiscoverDialog provider={discover} onOpenChange={(o) => !o && setDiscover(null)} />
      <TestDialog provider={testing} onOpenChange={(o) => !o && setTesting(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Anbieter löschen?"
        description={`„${deleting?.name}“ und alle ${deleting?.modelCount ?? 0} zugehörigen Modelle werden entfernt. Der API-Schlüssel wird gelöscht.`}
        onConfirm={() => run(() => api(`/api/admin/providers/${deleting!.id}`, { method: "DELETE" }), "Anbieter gelöscht.").then(() => {})}
      />
    </>
  )
}
