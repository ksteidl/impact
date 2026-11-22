import {
  DEFAULT_SETTINGS, audit, enforceRetention, getAllSettings, getSetting, setSetting, transaction, type SettingKey,
} from "@/server/db"
import { bad, body, json, route } from "@/server/http"

export const GET = route({ admin: true }, () => json(getAllSettings()))

const NUMERIC: SettingKey[] = ["retention_days", "usage_retention_days", "default_daily_tokens"]
const BOOLEAN: SettingKey[] = ["store_chats", "redact_pii"]

export const PUT = route({ admin: true }, async ({ req, user, ip }) => {
  const b = await body(req)
  const changed: string[] = []
  transaction(() => {
    for (const key of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) {
      if (!(key in b)) continue
      let value = String(b[key])
      if (NUMERIC.includes(key)) {
        const n = Number(value)
        if (!Number.isInteger(n) || n < 0) throw bad(`Ungültiger Wert für ${key}.`)
        value = String(n)
      }
      if (BOOLEAN.includes(key)) value = value === "1" || value === "true" ? "1" : "0"
      if (value !== getSetting(key)) {
        setSetting(key, value.slice(0, 20000))
        changed.push(key)
      }
    }
  })
  if (changed.length) {
    audit(user, "settings.updated", changed.join(", "), ip)
    enforceRetention()
  }
  return json({ ok: true, changed })
})
