import { get, run, audit, transaction } from "@/server/db"
import { body, bad, json, route } from "@/server/http"
import { adminModel, validateModel } from "@/server/admin"
import { allModels } from "@/server/services"

export const GET = route({ admin: true }, () => json(allModels().map(adminModel)))

export const POST = route({ admin: true }, async ({ req, user, ip }) => {
  const b = await body(req)
  const p = get<{ id: number; name: string }>("SELECT id, name FROM providers WHERE id = ?", Number(b.providerId))
  if (!p) throw bad("Anbieter nicht gefunden.")
  const list = (Array.isArray(b.models) ? b.models : [b]) as Record<string, unknown>[]
  const ids = transaction(() =>
    list.map((item) => {
      const v = validateModel(item)
      const r = run(
        `INSERT INTO models (provider_id, model_id, display_name, description, enabled, max_tokens, effort, allowed_departments, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(provider_id, model_id) DO NOTHING`,
        p.id, v.modelId, v.displayName, v.description, v.enabled, v.maxTokens, v.effort, v.allowedDepartments, v.sortOrder
      )
      return Number(r.lastInsertRowid)
    })
  )
  audit(user, "model.created", `${p.name}: ${list.map((m) => m.modelId).join(", ")}`, ip)
  return json({ ids })
})
