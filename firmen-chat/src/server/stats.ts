import { all, get, now } from "./db"

export type UsageStats = {
  days: number
  totals: { requests: number; input: number; output: number; redactions: number; users: number; errors: number }
  byModel: { provider_name: string; model_id: string; requests: number; input: number; output: number }[]
  byUser: { username: string; department: string; requests: number; input: number; output: number; redactions: number }[]
  byDay: { day: string; requests: number; tokens: number; input: number; output: number }[]
}

export const clampDays = (d: unknown) => Math.min(Math.max(Number(d) || 30, 1), 3650)

function localDay(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function usageStats(daysIn: unknown): UsageStats {
  const days = clampDays(daysIn)
  const since = now() - days * 86400000
  const totals = get<UsageStats["totals"]>(
    `SELECT COUNT(*) AS requests, COALESCE(SUM(input_tokens),0) AS input, COALESCE(SUM(output_tokens),0) AS output,
            COALESCE(SUM(redactions),0) AS redactions, COUNT(DISTINCT user_id) AS users,
            COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END),0) AS errors
     FROM usage WHERE created_at >= ?`,
    since
  )!
  const byModel = all<UsageStats["byModel"][number]>(
    `SELECT provider_name, model_id, COUNT(*) AS requests, SUM(input_tokens) AS input, SUM(output_tokens) AS output
     FROM usage WHERE created_at >= ? GROUP BY provider_name, model_id ORDER BY requests DESC`,
    since
  )
  const byUser = all<UsageStats["byUser"][number]>(
    `SELECT username, department, COUNT(*) AS requests, SUM(input_tokens) AS input, SUM(output_tokens) AS output,
            SUM(redactions) AS redactions
     FROM usage WHERE created_at >= ? GROUP BY username, department
     ORDER BY (SUM(input_tokens) + SUM(output_tokens)) DESC LIMIT 200`,
    since
  )
  // Tagesreihe lückenlos (auch Tage ohne Nutzung), gruppiert nach lokaler Zeit
  const rows = all<{ created_at: number; input_tokens: number; output_tokens: number }>(
    "SELECT created_at, input_tokens, output_tokens FROM usage WHERE created_at >= ?",
    since
  )
  const map = new Map<string, UsageStats["byDay"][number]>()
  const span = Math.min(days, 90)
  for (let i = span - 1; i >= 0; i--) {
    const day = localDay(now() - i * 86400000)
    map.set(day, { day, requests: 0, tokens: 0, input: 0, output: 0 })
  }
  for (const r of rows) {
    const e = map.get(localDay(r.created_at))
    if (!e) continue
    e.requests++
    e.input += r.input_tokens
    e.output += r.output_tokens
    e.tokens += r.input_tokens + r.output_tokens
  }
  return { days, totals, byModel, byUser, byDay: [...map.values()] }
}

export type AuditRow = { id: number; actor_name: string; action: string; details: string; ip: string; created_at: number }
export const auditLog = (limit = 500) => all<AuditRow>("SELECT * FROM audit ORDER BY id DESC LIMIT ?", Math.min(limit, 2000))
