import { all, run, now, audit } from "@/server/db"
import { encrypt } from "@/server/security"
import { body, json, route } from "@/server/http"
import { adminProvider, validateProvider } from "@/server/admin"

export const GET = route({ admin: true }, () =>
  json(
    all<Parameters<typeof adminProvider>[0]>(
      "SELECT p.*, (SELECT COUNT(*) FROM models m WHERE m.provider_id = p.id) AS model_count FROM providers p ORDER BY name"
    ).map(adminProvider)
  )
)

export const POST = route({ admin: true }, async ({ req, user, ip }) => {
  const b = await body(req)
  const v = validateProvider(b)
  const r = run(
    "INSERT INTO providers (name, type, base_url, api_key_enc, options_json, is_local, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    v.name, v.type, v.baseUrl, encrypt(String(b.apiKey || "").trim()), v.options, v.local, v.enabled, now()
  )
  audit(user, "provider.created", `${v.name} (${v.type}${v.local ? ", lokal" : ""})`, ip)
  return json({ id: Number(r.lastInsertRowid) })
})
