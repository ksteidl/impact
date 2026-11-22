import { requirePageUser } from "@/server/http"
import Link from "next/link"
import { ActivityIcon, DownloadIcon, ShieldCheckIcon, TriangleAlertIcon, UsersIcon, ZapIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { PageHeader } from "@/components/admin/admin-sidebar"
import { UsageChart } from "@/components/admin/usage-chart"
import { usageStats } from "@/server/stats"
import { fmtCompact, fmtNumber } from "@/lib/api"
import { cn } from "@/lib/utils"

export const metadata = { title: "Übersicht" }

const RANGES = [7, 30, 90, 365]

export default async function OverviewPage({ searchParams }: PageProps<"/admin">) {
  await requirePageUser(true)
  const sp = await searchParams
  const stats = usageStats(sp.days)
  const t = stats.totals
  const maxModel = Math.max(1, ...stats.byModel.map((m) => m.input + m.output))

  const cards = [
    { label: "Anfragen", value: fmtNumber(t.requests), icon: ActivityIcon, hint: `in ${stats.days} Tagen` },
    { label: "Aktive Nutzer", value: fmtNumber(t.users), icon: UsersIcon, hint: "mit mindestens einer Anfrage" },
    { label: "Tokens gesamt", value: fmtCompact(t.input + t.output), icon: ZapIcon, hint: `${fmtCompact(t.input)} Input · ${fmtCompact(t.output)} Output` },
    { label: "Geschwärzte Angaben", value: fmtNumber(t.redactions), icon: ShieldCheckIcon, hint: `${fmtNumber(t.errors)} fehlgeschlagene Anfragen` },
  ]

  return (
    <>
      <PageHeader title="Übersicht" description="Nutzung des KI-Assistenten im Unternehmen. Es werden nur Metadaten erfasst, keine Chat-Inhalte.">
        <div className="flex rounded-lg border bg-muted/50 p-0.5">
          {RANGES.map((d) => (
            <Link
              key={d}
              href={`/admin?days=${d}`}
              className={cn(
                "rounded-md px-3 py-1 text-sm transition-colors",
                d === stats.days ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {d === 365 ? "1 Jahr" : `${d} Tage`}
            </Link>
          ))}
        </div>
        <Button variant="outline" asChild>
          <a href={`/api/admin/usage/csv?days=${stats.days}`}>
            <DownloadIcon /> CSV-Export
          </a>
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="gap-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardDescription>{c.label}</CardDescription>
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <c.icon className="size-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold tracking-tight tabular-nums">{c.value}</div>
              <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Token-Verbrauch</CardTitle>
          <CardDescription>Pro Tag{stats.days > 90 ? " (letzte 90 Tage)" : ""}</CardDescription>
        </CardHeader>
        <CardContent>
          {t.requests ? (
            <UsageChart data={stats.byDay} />
          ) : (
            <Empty className="h-64">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ActivityIcon />
                </EmptyMedia>
                <EmptyTitle>Noch keine Nutzung</EmptyTitle>
                <EmptyDescription>Sobald Mitarbeiter chatten, erscheinen hier die Zahlen.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Nach Modell</CardTitle>
            <CardDescription>Tokens je Modell</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {stats.byModel.length === 0 && <p className="text-sm text-muted-foreground">Keine Daten.</p>}
            {stats.byModel.map((m) => {
              const total = m.input + m.output
              return (
                <div key={`${m.provider_name}/${m.model_id}`} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{m.model_id}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">{fmtCompact(total)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${Math.max(2, (total / maxModel) * 100)}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {m.provider_name} · {fmtNumber(m.requests)} Anfragen
                  </p>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Nach Benutzer</CardTitle>
            <CardDescription>Die aktivsten Konten im Zeitraum</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Benutzer</TableHead>
                  <TableHead>Abteilung</TableHead>
                  <TableHead className="text-right">Anfragen</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Schwärzungen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.byUser.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Keine Daten.
                    </TableCell>
                  </TableRow>
                )}
                {stats.byUser.slice(0, 10).map((u) => (
                  <TableRow key={u.username}>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell className="text-muted-foreground">{u.department || "–"}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNumber(u.requests)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtCompact(u.input + u.output)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {u.redactions ? (
                        <span className="inline-flex items-center gap-1 text-warning">
                          <TriangleAlertIcon className="size-3" />
                          {fmtNumber(u.redactions)}
                        </span>
                      ) : (
                        "0"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
