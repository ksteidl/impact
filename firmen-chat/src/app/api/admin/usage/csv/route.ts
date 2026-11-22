import { all, audit, now } from "@/server/db"
import { route } from "@/server/http"
import { clampDays } from "@/server/stats"

type U = {
  created_at: number
  username: string
  department: string
  provider_name: string
  model_id: string
  input_tokens: number
  output_tokens: number
  redactions: number
  status: string
  duration_ms: number
}

function cell(v: unknown) {
  let s = String(v ?? "")
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}` // Schutz gegen Formel-Injection in Excel
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const GET = route({ admin: true }, ({ req, user, ip }) => {
  const days = clampDays(new URL(req.url).searchParams.get("days"))
  const rows = all<U>("SELECT * FROM usage WHERE created_at >= ? ORDER BY created_at", now() - days * 86400000)
  const lines = [
    ["Zeitpunkt", "Benutzer", "Abteilung", "Anbieter", "Modell", "Input-Tokens", "Output-Tokens", "Schwärzungen", "Status", "Dauer (ms)"].join(";"),
    ...rows.map((r) =>
      [new Date(r.created_at).toISOString(), r.username, r.department, r.provider_name, r.model_id, r.input_tokens, r.output_tokens, r.redactions, r.status, r.duration_ms]
        .map(cell)
        .join(";")
    ),
  ]
  audit(user, "usage.exported", `${days} Tage`, ip)
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nutzung-${days}-tage.csv"`,
      "Cache-Control": "no-store",
    },
  })
})
