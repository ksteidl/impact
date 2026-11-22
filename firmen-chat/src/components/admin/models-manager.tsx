"use client"

import { useState } from "react"
import Link from "next/link"
import { BoxesIcon, LockIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon, UsersIcon } from "lucide-react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { ConfirmDialog } from "@/components/app/dialogs"
import { ProviderIcon } from "@/components/chat/provider-icon"
import { PageHeader } from "./admin-sidebar"
import { FormField, useAction } from "./form"
import type { AdminModel, AdminProvider } from "@/server/admin"

const EFFORTS = [
  { value: "default", label: "Standard des Modells" },
  { value: "minimal", label: "minimal (OpenAI)" },
  { value: "low", label: "low – schnell" },
  { value: "medium", label: "medium" },
  { value: "high", label: "high" },
  { value: "xhigh", label: "xhigh (Claude)" },
  { value: "max", label: "max (Claude)" },
]

type Draft = {
  providerId: string
  modelId: string
  displayName: string
  description: string
  allowedDepartments: string
  maxTokens: string
  effort: string
  sortOrder: string
  enabled: boolean
}

const toDraft = (m?: AdminModel, providerId?: number): Draft => ({
  providerId: String(m?.providerId ?? providerId ?? ""),
  modelId: m?.modelId ?? "",
  displayName: m?.displayName ?? "",
  description: m?.description ?? "",
  allowedDepartments: m?.allowedDepartments ?? "",
  maxTokens: m?.maxTokens ? String(m.maxTokens) : "",
  effort: m?.effort || "default",
  sortOrder: String(m?.sortOrder ?? 100),
  enabled: m?.enabled ?? true,
})

function ModelDialog({
  open,
  onOpenChange,
  model,
  providers,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  model?: AdminModel
  providers: AdminProvider[]
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && <ModelForm model={model} providers={providers} close={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function ModelForm({ model, providers, close }: { model?: AdminModel; providers: AdminProvider[]; close: () => void }) {
  const [d, setD] = useState<Draft>(() => toDraft(model, providers[0]?.id))
  const { run, pending } = useAction()
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value })

  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        const body = { ...d, effort: d.effort === "default" ? "" : d.effort }
        await run(
          () =>
            model
              ? api(`/api/admin/models/${model.id}`, { method: "PUT", body })
              : api("/api/admin/models", { method: "POST", body }),
          model ? "Modell gespeichert." : "Modell hinzugefügt."
        ).then(close, () => {})
      }}
    >
      <DialogHeader>
        <DialogTitle>{model ? `${model.displayName} bearbeiten` : "Modell hinzufügen"}</DialogTitle>
        <DialogDescription>
          {model ? `${model.providerName} · ${model.modelId}` : "Tipp: Unter „Anbieter“ lassen sich alle Modelle automatisch abrufen."}
        </DialogDescription>
      </DialogHeader>
      {!model && (
        <FormField label="Anbieter">
          <Select value={d.providerId} onValueChange={(v) => setD({ ...d, providerId: v })}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Anbieter wählen" />
            </SelectTrigger>
            <SelectContent>
              {providers.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Modell-ID" htmlFor="m-id" hint="Wie beim Anbieter; bei Azure der Deployment-Name.">
          <Input id="m-id" value={d.modelId} onChange={set("modelId")} required placeholder="claude-opus-5-5" className="font-mono" />
        </FormField>
        <FormField label="Anzeigename" htmlFor="m-name">
          <Input id="m-name" value={d.displayName} onChange={set("displayName")} placeholder="Claude Opus 5.5" />
        </FormField>
      </div>
      <FormField label="Beschreibung für Mitarbeiter" htmlFor="m-desc">
        <Input id="m-desc" value={d.description} onChange={set("description")} placeholder="Stärkstes Modell für komplexe Aufgaben" />
      </FormField>
      <FormField label="Freigegeben für Abteilungen" htmlFor="m-dep" hint="Kommagetrennt, z. B. „IT, Marketing“. Leer = alle Mitarbeiter.">
        <Input id="m-dep" value={d.allowedDepartments} onChange={set("allowedDepartments")} placeholder="alle" />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Max. Antwort-Tokens" htmlFor="m-max">
          <Input id="m-max" type="number" min={1} value={d.maxTokens} onChange={set("maxTokens")} placeholder="Standard" />
        </FormField>
        <FormField label="Denkaufwand">
          <Select value={d.effort} onValueChange={(v) => setD({ ...d, effort: v })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EFFORTS.map((e) => (
                <SelectItem key={e.value} value={e.value}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Reihenfolge" htmlFor="m-sort">
          <Input id="m-sort" type="number" value={d.sortOrder} onChange={set("sortOrder")} />
        </FormField>
      </div>
      <label className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">Aktiv</p>
          <p className="text-xs text-muted-foreground">Für freigegebene Mitarbeiter im Chat sichtbar</p>
        </div>
        <Switch checked={d.enabled} onCheckedChange={(v) => setD({ ...d, enabled: v })} />
      </label>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={pending || !d.modelId || !d.providerId}>
          {pending && <Spinner />} Speichern
        </Button>
      </DialogFooter>
    </form>
  )
}

export function ModelsManager({ models, providers }: { models: AdminModel[]; providers: AdminProvider[] }) {
  const [editing, setEditing] = useState<AdminModel | undefined>()
  const [dialog, setDialog] = useState(false)
  const [deleting, setDeleting] = useState<AdminModel | null>(null)
  const [query, setQuery] = useState("")
  const { run } = useAction()
  const q = query.trim().toLowerCase()
  const list = q
    ? models.filter((m) => `${m.displayName} ${m.modelId} ${m.providerName}`.toLowerCase().includes(q))
    : models
  const active = models.filter((m) => m.enabled).length

  const toggle = (m: AdminModel, enabled: boolean) =>
    run(() => api(`/api/admin/models/${m.id}`, { method: "PUT", body: { ...m, enabled } }), enabled ? `${m.displayName} aktiviert.` : `${m.displayName} deaktiviert.`).catch(() => {})

  return (
    <>
      <PageHeader title="Modelle" description={`${active} von ${models.length} Modellen sind für Mitarbeiter freigeschaltet.`}>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Modelle filtern …" className="w-56" />
        <Button
          onClick={() => {
            setEditing(undefined)
            setDialog(true)
          }}
          disabled={!providers.length}
        >
          <PlusIcon /> Modell hinzufügen
        </Button>
      </PageHeader>

      {models.length === 0 ? (
        <Card>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BoxesIcon />
              </EmptyMedia>
              <EmptyTitle>Noch keine Modelle</EmptyTitle>
              <EmptyDescription>Legen Sie einen Anbieter an und übernehmen Sie dessen Modelle mit einem Klick.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild>
                <Link href="/admin/providers">Zu den Anbietern</Link>
              </Button>
            </EmptyContent>
          </Empty>
        </Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Modell</TableHead>
                <TableHead>Anbieter</TableHead>
                <TableHead>Freigabe</TableHead>
                <TableHead>Aktiv</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((m) => (
                <TableRow key={m.id} className={m.enabled ? "" : "opacity-60"}>
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-3">
                      <ProviderIcon name={m.providerName} local={m.local} className="size-8 rounded-lg" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 font-medium">
                          {m.displayName}
                          {m.local && (
                            <Badge variant="outline" className="gap-1 border-success/30 text-success">
                              <LockIcon className="size-3" /> Lokal
                            </Badge>
                          )}
                        </div>
                        <div className="truncate font-mono text-xs text-muted-foreground">{m.modelId}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{m.providerName}</TableCell>
                  <TableCell>
                    {m.allowedDepartments ? (
                      <div className="flex flex-wrap gap-1">
                        {m.allowedDepartments.split(",").map((d) => d.trim()).filter(Boolean).map((d) => (
                          <Badge key={d} variant="secondary">
                            {d}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                        <UsersIcon className="size-3.5" /> Alle
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch checked={m.enabled} onCheckedChange={(v) => toggle(m, v)} aria-label={`${m.displayName} aktiv`} />
                  </TableCell>
                  <TableCell className="pr-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8" aria-label="Aktionen">
                          <MoreHorizontalIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            setEditing(m)
                            setDialog(true)
                          }}
                        >
                          <PencilIcon /> Bearbeiten
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(m)}>
                          <Trash2Icon /> Entfernen
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {list.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Keine Treffer.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      <ModelDialog open={dialog} onOpenChange={setDialog} model={editing} providers={providers} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Modell entfernen?"
        description={`„${deleting?.displayName}“ ist danach für niemanden mehr verfügbar. Gespeicherte Chats bleiben erhalten.`}
        confirmLabel="Entfernen"
        onConfirm={() => run(() => api(`/api/admin/models/${deleting!.id}`, { method: "DELETE" }), "Modell entfernt.").then(() => {})}
      />
    </>
  )
}
