import { requirePageUser } from "@/server/http"
import { ScrollTextIcon } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/admin/admin-sidebar"
import { auditLog } from "@/server/stats"
import { fmtDate } from "@/lib/api"

export const metadata = { title: "Protokoll" }

const ACTIONS: Record<string, { label: string; tone?: "warn" | "danger" | "ok" }> = {
  login: { label: "Anmeldung", tone: "ok" },
  "login.failed": { label: "Anmeldung fehlgeschlagen", tone: "danger" },
  "password.changed": { label: "Passwort geändert" },
  "user.created": { label: "Benutzer angelegt" },
  "user.updated": { label: "Benutzer geändert" },
  "user.deleted": { label: "Benutzer gelöscht", tone: "warn" },
  "user.password_reset": { label: "Passwort zurückgesetzt", tone: "warn" },
  "provider.created": { label: "Anbieter angelegt" },
  "provider.updated": { label: "Anbieter geändert" },
  "provider.deleted": { label: "Anbieter gelöscht", tone: "warn" },
  "model.created": { label: "Modelle hinzugefügt" },
  "model.updated": { label: "Modell geändert" },
  "model.deleted": { label: "Modell entfernt", tone: "warn" },
  "settings.updated": { label: "Richtlinien geändert", tone: "warn" },
  "usage.exported": { label: "Nutzung exportiert" },
  "chat.blocked": { label: "Nachricht blockiert", tone: "danger" },
  bootstrap: { label: "Ersteinrichtung" },
}

const TONE = {
  ok: "border-success/30 text-success",
  warn: "border-warning/30 text-warning",
  danger: "border-destructive/30 text-destructive",
}

export default async function AuditPage() {
  await requirePageUser(true)
  const rows = auditLog(500)
  return (
    <>
      <PageHeader title="Protokoll" description="Anmeldungen und Verwaltungsaktionen der letzten 500 Ereignisse." />
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Zeitpunkt</TableHead>
              <TableHead>Wer</TableHead>
              <TableHead>Aktion</TableHead>
              <TableHead>Details</TableHead>
              <TableHead className="pr-4">IP-Adresse</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  <ScrollTextIcon className="mx-auto mb-2 size-5" /> Noch keine Einträge.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const a = ACTIONS[r.action] ?? { label: r.action }
              return (
                <TableRow key={r.id}>
                  <TableCell className="pl-4 whitespace-nowrap text-muted-foreground tabular-nums">{fmtDate(r.created_at)}</TableCell>
                  <TableCell className="font-medium">{r.actor_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={a.tone ? TONE[a.tone] : ""}>
                      {a.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md truncate text-muted-foreground" title={r.details}>
                    {r.details || "–"}
                  </TableCell>
                  <TableCell className="pr-4 font-mono text-xs text-muted-foreground">{r.ip || "–"}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </>
  )
}
